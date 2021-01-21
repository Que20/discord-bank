const Discord = require('discord.js')
const mongoose = require('mongoose')

// CONSTANTS
let cmd_prefix = "!"
let reward_role = "Banquier"
var auto_reward_delay = 60 // 1 min
let inacive_penalty = 432000 // 5 jours
let coin_tag = "⍧"

require('dotenv').config()

const bankClient = new Discord.Client()

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
        rewardMessage(msg)
    }
})

async function showIntro(message) {
    message.channel.send("🏦 Ce serveur utilise un systeme de monnaie interne. Interragis dans les differents chan textuels et gagne des "+coin_tag+" que tu peux ensuite dépenser.")
    message.channel.send("Liste des commandes:\n- `!balance` : permet de voir combien de "+coin_tag+" tu as\n- `!transfert <montant> <membre>` : pour offrir des "+coin_tag+" à un autre membre\n")
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
}

async function showList(message) {
    var log = ""
    let list = await Member.find()
    for (user of list) {
        log = log+"\n"+getUser(message, user.user)+"\t\t"+user.balance
    }
    message.channel.send(log)
}

async function setDelay(message, value) {
    if (message.member.roles.cache.some(role => role.name === reward_role)) {
        if (value != null) {
            let d = parseInt(value, 10)
            auto_reward_delay = d*60
            message.channel.send("🏦 La distribution se fait maintenant toutes les **"+d+" minutes**.")
        }
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
    const amount = parseInt(args[0], 10)
    if (amount <= 0) {
        message.channel.send("Le montant doit étre supérieur ou égal à 0"+coin_tag+"")
        return
    }
    giveReward(from.id, -amount)
    giveReward(to.id, amount)
    message.channel.send("🏦 Quelle générosité ! "+from.toString()+" vient de donner "+amount+""+coin_tag+"  à "+to.toString())
}

async function giveReward(userID, amount) {
    const user = await Member.findOne({ user: userID })
    if (user == null) {
        let current = 1 + Date.now()
        const newMember = await Member.create({user: userID, balance: amount, lastUpdated: current })
    } else {
        let updated = await Member.findOneAndUpdate({ user: userID }, { balance: user.balance+amount }, { new: true})
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

function getUser(message, id) {
    return message.guild.members.cache.get(id).user.username
}