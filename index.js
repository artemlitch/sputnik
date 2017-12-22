StellarSdk = require('stellar-sdk');
var server = new StellarSdk.Server('https://horizon.stellar.org');

var levelup = require('levelup');
var leveldown = require('leveldown');
var gmailSend = require('gmail-send');
var credentials = require('./credentials.json');
var FS = require('fs');
var EJS = require('ejs');
var path = require('path');
var sputnikAccount = 'GCS4MDRT7DEOZ6VRVS72J56D5E6XLAGU4G37ZLOVGUQPCOXZTKWIX5LO';
// 1) Create our store
var db = levelup(leveldown('./mydb'));

var localCache = {};
function loadFile(filename) {
    var filePath = path.join(__dirname, filename);
    return String(FS.readFileSync(filePath));
}
var sputnikTxHandler = function (txResponse) {
    var source_account = txResponse.source_account;
    console.log("got a sputnik TX");
    if (source_account === sputnikAccount) {
        return;
    }
    if (txResponse.memo_type !== 'text') {
        return;
    }
    if (txResponse.memo === 'STOP') {
        db.get(source_account, function (err, email) {
            if (err) return;
            db.del(source_account, function (err) {
                if (err) console.log('error deleting key '+source_account);
                // handle I/O or other error
                console.log("deleting "+ source_account);
                sendDeleteEmail(email);
                delete localCache[source_account];
            });
        })
    }
    var emailMatch = txResponse.memo.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
    if (emailMatch === null) {
        return;
    }
    var email = emailMatch[0];
    console.log("Check if they have email: " + email);
    console.log("whats the account to watch?: "+source_account);
    localCache[source_account] = email;
    db.put(source_account, email, function (err) {
        if (err) return console.log('Ooops!', err) // some kind of I/O error
        console.log("saved email");
        sendConfirmEmail(email, source_account);
    })
};
var subEmail = loadFile('sub_email.ejs');
function sendConfirmEmail(email, deposit_account) {
    var subject = "You have subscribed to Sputnik!";

    var templateData = {
        address: deposit_account,
    };
    var emailHtml = EJS.render(subEmail, templateData);
    gmailSend({
        user: credentials.user,                  // Your GMail account used to send emails
        pass: credentials.pass,                  // Application-specific password
        to:   email,
        subject: subject,
        html: emailHtml,
    })();
}

var unsubEmail = loadFile('unsub_email.ejs');
function sendDeleteEmail(email) {
    var subject = "You have unsubscribed from sputnik.";
    console.log("send to: "+ email);
    var emailHtml = EJS.render(unsubEmail, {});

    gmailSend({
        user: credentials.user,                  // Your GMail account used to send emails
        pass: credentials.pass,                  // Application-specific password
        to:   email,
        subject: subject,
        html: emailHtml,
    })();
}
var txEmail = loadFile('tx_email.ejs');

function sendEmail(email, tx_from, tx_amount, tx_asset) {
    if (tx_asset === 'native') {
        tx_asset = "Lumens";
    }
    var templateData = {
        amount: tx_amount,
        asset_type: tx_asset,
        address: tx_from,
    };
    var emailHtml = EJS.render(txEmail, templateData);
    var subject = "You have received "+ tx_amount + ' ' + tx_asset;
    console.log("send to: "+ email);
    gmailSend({
        user: credentials.user,                  // Your GMail account used to send emails
        pass: credentials.pass,                  // Application-specific password
        to:   email,
        subject: subject,
        html: emailHtml,
    })();

}
var paymentTxHandler = function (txResponse) {
    if (txResponse.type !== 'payment') {
        return;
    }
    var watched_account = txResponse.to;
    // check if source account exists in DB
    var email = localCache[watched_account];
    if (email === undefined) {
        db.get(watched_account, function (err, email) {
            if (err) return;
            sendEmail(email, txResponse.from, txResponse.amount, txResponse.asset_type);
        })
    } else {
        sendEmail(email, txResponse.from, txResponse.amount, txResponse.asset_type);
    }
};

console.log("watching for transactions to sputnik");
var sputnikStream = server.transactions()
    .cursor('now')
    .forAccount(sputnikAccount)
    .stream({
        onmessage: sputnikTxHandler
    });

console.log("watching for all operations on network");
var paymentStream = server.operations()
    .cursor('now')
    .stream({
        onmessage: paymentTxHandler
    })


