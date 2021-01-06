import dotenv from "dotenv";
import { ClusterClient, CommandClient, ShardClient } from "detritus-client";
import signale from "signale";
import { ActivityTypes, ChannelTypes } from "detritus-client/lib/constants";
import { ParsedArgs } from "detritus-client/lib/command";
import { Embed } from "detritus-client/lib/utils";
import c from "./countries.json";
import axios from "axios";
import { parse } from "node-html-parser";
import { JsonDB } from "node-json-db";
import { Config } from "node-json-db/dist/lib/JsonDBConfig";

const countries = c as Record<string, string[]>,
    db = new JsonDB(new Config("db", true));

dotenv.config();

const check = async (country: string) => {
    const data = countries[country],
        r = await axios.get(data[1]),
        html = parse(r.data),
        availability = html.querySelector(".range-revamp-stockcheck__text");
    if(data[2]) {
        if(availability.innerText == data[2]) {
            return true;
        } else {
            return false;
        }
    } else {
        if(availability.innerText.startsWith("Available")) {
            return true;
        } else {
            return false;
        }
    }
};

const autoCheck = async (client: ShardClient) => {
    signale.pending("Running autocheck");
    const channel = client.guilds.first()?.channels.find(c => c.id == db.getData("/channel"));
    if(!channel) return;
    Object.keys(countries).forEach(async (cc) => {
        const result = await check(cc);
        signale.info(`${cc} - ${result}`);
        try {
            db.getData(`/countries/${cc}`);
        } catch(err) {
            db.push(`/countries/${cc}`, false);
        }
        if(db.getData(`/countries/${cc}`) != result) {
            const embed = new Embed(), data = countries[cc];
            if(result) {
                embed.setTitle(`Djungelskog is now in stock in ${data[0]}!`);
                embed.setUrl(data[1]);
            } else {
                embed.setTitle(`Djungelskog is now out of stock in ${data[0]}!`);
            }
            const role = client.guilds.first()?.roles.find(r => r.name == `Djungelsbot-${cc}`);
            channel?.createMessage({content: role?.mention || "", embed});
            db.push(`/countries/${cc}`, result);
        }
    });
};

const commandClient = new CommandClient(process.env.DISCORD_TOKEN as string, {
    prefix: "d!"
});

commandClient.add({
    name: "ping",
    metadata: {
        description: "Checks the bot's ping to Discord."
    },
    run: async (ctx): Promise<void> => {
        const ping = await ctx.client.ping(),
            embed = new Embed();
        embed.setTitle(`🏓 Pong! Ping: \`${ping.rest}ms\``);
        embed.setDescription(`Gateway ping: \`${ping.gateway}ms\``);
        ctx.reply({embed});
    }
});

commandClient.add({
    name: "help",
    metadata: {
        description: "Shows all commands."
    },
    run: (ctx): void => {
        const embed = new Embed(),
            description = ctx.commandClient.commands.map(c => {
                return `**${c.name}** - ${c.metadata.description}`;
            });
        embed.setTitle("All commands");
        embed.setDescription(description.join("\n"));
        ctx.reply({embed});
    }
});

commandClient.add({
    name: "check",
    metadata: {
        description: "Manually check stock for a country."
    },
    run: async (ctx, pArgs: ParsedArgs): Promise<void> => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const args = pArgs[ctx.command!.name],
            data = countries[args],
            embed = new Embed();
        
        if(!data) {
            embed.setTitle("Country not found. Available options are (in alpha-2 format):");
            embed.setDescription(Object.keys(countries).join(","));
        } else { 
            const result = await check(args);
            if(result) {
                embed.setTitle(`Djungelskog is in stock in ${data[0]}!`);
                embed.setUrl(data[1]);
            } else {
                embed.setTitle(`Djungelskog is not in stock in ${data[0]}.`);
            }
        }

        ctx.reply({embed});
    }
});

commandClient.add({
    name: "setup",
    metadata: {
        description: "Sets up the bot for the server. Bot/server owner only."
    },
    onBefore: (ctx) => ctx.member?.isOwner || ctx.member?.isClientOwner || false,
    run: (ctx, pArgs: ParsedArgs) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const args = pArgs[ctx.command!.name].split(" "),
            embed = new Embed();
        
        if(!args[0]) {
            embed.setTitle("No option given. Valid options are `channel` and `roles`.");
        } else if(args[0] == "channel") {
            if(!args[1]) {
                embed.setTitle("No channel was mentioned.");
            } else {
                const channel = ctx.guild?.channels.find(c => c.name == args[1] && c.type == ChannelTypes.GUILD_TEXT);
                if(!channel) {
                    embed.setTitle("Channel not found.");
                    embed.setDescription("Make sure you have used the channel name, not the mention!");
                } else {
                    db.push("/channel", ctx.guild?.channels.find(c => c.name == args[1])?.id);
                    embed.setTitle(`Stock update channel set to \`#${channel.name}\``);
                }
            }
        } else if(args[0] == "roles") {
            const roles = ctx.guild?.roles.map(r => r.name),
                keys = Object.keys(countries);
            let description = "";
            
            keys.forEach(key => {
                if(!roles?.includes(`Djungelsbot-${key.toUpperCase()}`)) {
                    ctx.guild?.createRole({
                        name: `Djungelsbot-${key.toUpperCase()}`
                    });
                    description = description + `\nAdded Djungelsbot-${key.toUpperCase()}`;
                }
            });

            embed.setTitle("All roles are configured correctly.");
            embed.setDescription(description);
        } else {
            embed.setTitle("Option does not exist. Valid options are `channel` and `roles`.");
        }
        
        ctx.reply({embed});
    }
});

commandClient.add({
    name: "subscribe",
    metadata: {
        description: "Subscribe to stock updates for a country."
    },
    run: (ctx, pArgs: ParsedArgs) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const args = pArgs[ctx.command!.name],
            role = ctx.guild?.roles.find(r => r.name == `Djungelsbot-${args.toUpperCase()}`),
            embed = new Embed();

        if(!args[0]) {
            embed.setTitle("Country not found. Available options are (in alpha-2 format):");
            embed.setDescription(Object.keys(countries).join(","));
        } else if(!role) {
            embed.setTitle("Role for country not found.");
            embed.setDescription("Check that the country is supported - if so, get the server/bot owner to run `d!setup roles`.");
        } else if(!ctx.member?.roles.find(r => r == role)) {
            ctx.member?.addRole(role.id);
            embed.setTitle(`Subscribed to \`${countries[args.toLowerCase()][0]}\` stock updates`);
        } else {
            ctx.member.removeRole(role.id);
            embed.setTitle(`Unsubscribed from \`${countries[args.toLowerCase()][0]}\` stock updates`);
        }

        ctx.reply({embed});
    }
});

(async () => {
    const client = await commandClient.run();
    try {
        db.getData("/channel");
    } catch(err) {
        db.push("/channel", "0");
    }
    (client as ClusterClient).shards.forEach(shard => {
        shard.gateway.setPresence({
            activity: {
                name: "with Djungelskog.",
                type: ActivityTypes.PLAYING
            }
        });
    });
    signale.success("Connected to Discord.");
    const interval = Number(process.env.CHECK_INTERVAL) * 60 * 1000;
    (client as ClusterClient).shards.forEach(shard => {
        setTimeout(() => {
            autoCheck(shard);
            setInterval(() => {
                autoCheck(shard);
            }, interval);
        }, 5000);
    });
})();