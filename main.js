const {table} = require('table')
const Discord = require('discord.js')
const mongoose = require('mongoose')

require('dotenv').config()

Array.prototype.subarray = function(start, end) {
    if (!end) { end = -1; } 
    return this.slice(start, this.length + 1 - (end * -1));
}

// CONSTANTS
let cmd_prefix = "!"
let reward_role = "Banquier"
var auto_reward_delay = 120 // 2 min
let inacive_penalty = 432000 // 5 jours
let coin_tag = "⍧"
let no_reward_channels = process.env.NO_REWARD_CHANNELS.split(';')
let reaction_based_reward_channels = process.env.REACTION_BASED_REWARD_CHANNELS.split(";")

const bankClient = new Discord.Client()

var racketCoolDown = 0

mongoose.connect(process.env.DB_URL, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false })
const db = mongoose.connection

const Member = mongoose.model('member', mongoose.Schema({
    user: String,
    balance: Number,
    lastUpdated: Number,
}), 'member')

db.on('error', (error) => console.error(error))
db.once('open', () => {
    console.log('connected to database')
    bankClient.login(process.env.BOT_TOKEN)
})

bankClient.on('ready', () => {
    console.log(`Bank logged in as ${bankClient.user.tag}!`)
})

bankClient.on('message', async msg => {
    if (msg.author.bot) { return }
    if (msg.content.startsWith(cmd_prefix)) {
        handleCommand(msg)
    } else {
        if (no_reward_channels.includes(msg.channel.name) == false) {
            rewardMessage(msg)
        }
        if (reaction_based_reward_channels.includes(msg.channel.name)) {
            const filter = (reaction, user) => {
                return ['😭', '🤣', '😂', '😅'].includes(reaction.emoji.name)
            }
            let delay = 5*60000
            msg.awaitReactions(filter, { max: 5, time: delay, errors: ['time'] })
	            // .then(collected => {
                //     //
                // })
                .catch(collected => {
                    let count = collected.size
                    giveReward(msg.author.id, count*1)
                });
        }
    }
})

async function showIntro(message) {
    message.channel.send("🏦 Ce serveur utilise un systeme de monnaie interne. Interragis dans les differents chan textuels et gagne des "+coin_tag+" que tu peux ensuite dépenser.")
    message.channel.send("Liste des commandes:\n- `!balance` : permet de voir combien de "+coin_tag+" tu as\n- `!transfert <montant> <membre>` : pour offrir des "+coin_tag+" à un autre membre\n- `!top5` : afficher le top 5 des plus riches du serveur")
    message.channel.send("Dépensez vos "+coin_tag+" dans le chan #marketplace ou venez tenter votre chance dans le chan #casino.")
}

async function handleCommand(message) {
    const args = message.content.slice(cmd_prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    if (command === 'balance') {
        await balance(message)
    }
    if (command === 'reward') {
        await reward(message, args)
    }
    if (command === 'transfert') {
        await transfert(message, args)
    }
    if (command === 'bank') {
        await showIntro(message)
    }
    if (command === 'delay') {
        await setDelay(message, args[0])
    }
    if (command === 'list') {
        await showList(message)
    }
    if (command === 'racket') {
        await racket(message)
    }
    if (command === 'top5') {
        await showTop(message)
    }
    if (command === 'boutique') {
        await handleStore(message, args)
    }
}

async function handleStore(message, args) {
    if (args[0] != null) {
        if (args[0] === 'add') {
            let role = args[1]
            let price = args[2]
            if (role != null && price != null) {
                message.channel.send('Element de boutique ajouté')
            } else {
                message.channel.send('Usage: !boutique add <role> <prix>')
                message.channel.send('Exemple: `!boutique add SuperRole 100`')
            }
        }
        if (args[0] === 'remove') {
            
        }
        if (args[0] === 'buy') {
            if (args[1] != null) {
                let role = args[1] == 1 ? "SuperRole" : "Pilier"
                message.channel.send(message.author.toString()+" achète le role "+role)
            } else {
                message.channel.send('Pour acheter, utilisez la commande `!boutique buy <numéro>`')
                message.channel.send('Pour consulter les rôles à vendre, utilisez la commande `!boutique`')
            }
        }
        if (args[0] === 'help') {
            message.channel.send('Liste des commandes de la boutique\n- `!boutique add <role> <prix>` (admin seulement) pour ajouter un rôle à vendre\n- `!boutique remove <numéro>` (admin seulement) pour supprimer un role à vendre\n- `!boutique buy <numéro>` acheter un rôle\n- `!boutique` pour afficher les roles disponnibles à l\'achat')
        }
    } else {
        message.channel.send('Roles à vendre :\n[1] - SuperRole - 100'+coin_tag+"\n[2] - Pilier - 400"+coin_tag)
        message.channel.send('Pour acheter, utilisez la commande `!boutique buy <numéro>`')
    }
}

async function showList(message) {
    if (message.member.roles.cache.some(role => role.name === reward_role)) {
        var log = []
        let list = await Member.find().sort({ balance: 'desc' })
        for (let i = 0; i < list.length; i++) {
            if (list[i] != null) {
                let user = await getUser(message, list[i].user)
                if (list[i].balance != 0) {
                    log.push([user.username, list[i].balance]) //truncateString(user.username, 9)
                }
            }
        }
        var i,j,temparray,chunk = 10;
        for (i=0,j=log.length; i<j; i+=chunk) {
            temparray = log.slice(i,i+chunk);
            let output = table(temparray)
            message.channel.send("```"+output+"```")
        }
        
    } else {
        message.channel.send("🏦 Tu n'es pas autorisé.e à faire ça.")
    }
}

async function showTop(message) {
    var log = []
    let list = await Member.find().sort({ balance: 'desc' })
    for (let i = 0; i < 5; i++) {
        if (list[i] != null) {
            let user = await getUser(message, list[i].user)
            if (list[i].balance != 0) {
                log.push([user.username, list[i].balance]) //truncateString(user.username, 9)
            }
        }
    }
    var i,j,temparray,chunk = 10;
    for (i=0,j=log.length; i<j; i+=chunk) {
        temparray = log.slice(i,i+chunk);
        let output = table(temparray)
        message.channel.send("```"+output+"```")
    }
}

async function setDelay(message, value) {
    if (message.member.roles.cache.some(role => role.name === reward_role)) {
        if (value != null) {
            let d = parseInt(value, 10)
            auto_reward_delay = d*60
            message.channel.send("🏦 La distribution se fait maintenant toutes les **"+d+" minutes**.")
        } else {
            message.channel.send("🏦 La distribution se fait toutes les **"+auto_reward_delay/60+" minutes**.")
        }
    } else {
        message.channel.send("🏦 Tu n'es pas autorisé.e à faire ça.")
    }
}

async function balance(message) {
    let user = message.mentions.users.first() == null ? message.author : message.mentions.users.first()
    let userId = user.id
    try {
        const member = await Member.findOne({ user: userId })
        if (member == null) {
            let current = 1 + Date.now()
            const newMember = await Member.create({user: userId, balance: 0, lastUpdated: current })
            message.channel.send("🏦 "+user.toString()+" possède "+ newMember.balance+coin_tag)
        } else {
            message.channel.send("🏦 "+user.toString()+" possède "+ member.balance+coin_tag)
        }
    } catch (e) {
        console.log(e)
    }
}

async function rewardMessage(message) {
    let userId = message.author.id
    try {
        const member = await Member.findOne({ user: userId })
        if (member == null) {
            let current = 1 + Date.now()
            const newMember = await Member.create({user: userId, balance: 0, lastUpdated: current })
        } else {
            let current = 1 + Date.now()
            let last = 1 + member.lastUpdated
            let delay = current - last
            if (delay > auto_reward_delay*1000) {
                if (delay > inacive_penalty*1000) {
                    message.channel.send("Hello "+message.author.toString()+" ça fait longtemps!\nTon absence ici t'as couté -10"+coin_tag+"")
                    let updated = await Member.findOneAndUpdate({ user: userId }, { balance: member.balance-10, lastUpdated: current }, { new: true})
                } else {
                    let updated = await Member.findOneAndUpdate({ user: userId }, { balance: member.balance+1, lastUpdated: current }, { new: true})
                }
            }
        }
    } catch (e) {
        console.log(e)
    }
}

async function transfert(message, args) {
    if (args.length != 2 && Number.isInteger(args[0])) {
        message.channel.send("Usage: !transfert <montant> <membre>")
        return
    }
    const from = message.author
    const to = message.mentions.users.first()
    if (to == null) {
        message.channel.send("Usage: !transfert <montant> <membre>")
        return
    }
    if (to.id == from.id) {
        message.channel.send("Vous ne pouvez pas vous transferer des "+coin_tag+" à vous même.")
        message.channel.send("Usage: !transfert <montant> <membre>")
        return
    }
    const amount = parseInt(args[0], 10)
    if (amount <= 0) {
        message.channel.send("Le montant doit étre supérieur ou égal à 0"+coin_tag+"")
        return
    }
    let f = await giveReward(from.id, -amount)
    if (f) {
        let t = giveReward(to.id, amount)
        message.channel.send("🏦 Quelle générosité ! "+from.toString()+" vient de donner "+amount+""+coin_tag+"  à "+to.toString())
    } else {
        message.channel.send("🏦 "+from.toString()+", tu ne peux pas transferer des "+coin_tag+" que tu n'as pas !")
    }
}

async function giveReward(userID, amount) {
    const user = await Member.findOne({ user: userID })
    if (user == null) {
        if (amount < 0) {
            return false
        }
        let current = 1 + Date.now()
        const newMember = await Member.create({user: userID, balance: amount, lastUpdated: current })
        return true
    } else {
        if (user.balance+amount > 0) {
            let updated = await Member.findOneAndUpdate({ user: userID }, { balance: user.balance+amount }, { new: true})
            return true
        } else {
            return false
        }
    }
}

async function racket(message) {
    let target = message.mentions.users.first()
    if (target == null) {
        message.channel.send("Usage: !racket <membre>")
        return
    }
    if (target.id == message.author.id) {
        message.channel.send("Tu ne peux pas te racketter toi même.")
        return
    }
    let now = Math.round(1+Date.now()/1000)
    if (now < racketCoolDown) {
        message.channel.send("Tu ne peux pas encore utiliser cette commande.")
        let delay = Math.round(racketCoolDown-now)
        console.log("wait "+delay)
        return
    } else {
        racketCoolDown = now+getRndInteger(60, 300)
    }
    let succcess = Math.floor(Math.random() * 2);
    if (succcess != 1) {
        message.channel.send("Désolé, tu n'as pas assez de charisme pour racketter cette personne.")
        return
    } else {
        let amount = Math.floor(Math.random() * 11);
        let racket = await giveReward(target.id, -amount)
        if (racket) {
            let stealer = await giveReward(message.author.id, amount)
            message.channel.send(message.author.toString()+" vient de racketter "+amount+coin_tag+" à "+target.toString()+".")
            return
        } else {
            message.channel.send("Désolé, tu n'as pas assez de charisme pour racketter cette personne.")
        }
    }
}

async function reward(message, args) {
    if (message.member.roles.cache.some(role => role.name === reward_role)) {
        let userId = message.mentions.users.first() == null ? message.author.id : message.mentions.users.first().id
        if (args[0] == null) {
            message.channel.send("Usage: !reward <montant> <membre>")
        } else {
            let amount = parseInt(args[0], 10)
            if (amount == null || amount == 0) {
                message.channel.send("Usage: !reward <montant> <membre>")
            } else {
                giveReward(userId, amount)
            }
        }
    } else {
        message.channel.send("🏦 Tu n'es pas autorisé.e à faire ça.")
    }
}

async function getUser(message, id) {
    return await bankClient.users.fetch(id, { cache: true })
}

function truncateString(str, n){
    return (str.length > n) ? str.substr(0, n-1).trim() + '...' : str;
}

function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1) ) + min;
}