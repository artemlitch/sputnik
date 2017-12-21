StellarSdk = require('stellar-sdk');
var server = new StellarSdk.Server('https://horizon.stellar.org');

var levelup = require('levelup');
var leveldown = require('leveldown');
var gmailSend = require('gmail-send');
var credentials = require('./credentials.json');

var sputnikAccount = 'GCS4MDRT7DEOZ6VRVS72J56D5E6XLAGU4G37ZLOVGUQPCOXZTKWIX5LO';
// 1) Create our store
var db = levelup(leveldown('./mydb'));

var localCache = {};

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
                sendDeleteEmail(email, source_account);
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
function sendConfirmEmail(email, deposit_account) {
    var subject = "You have subscribed to Sputnik!";

    gmailSend({
        user: credentials.user,                  // Your GMail account used to send emails
        pass: credentials.pass,                  // Application-specific password
        to:   email,
        subject: subject,
        text: 'Thanks for subscribing!\nYou will be emailed every time you receive a deposit to\n'+ deposit_account +'.\nTo unsubscribe, please send a payment transaction (can be as small as you like) with the memo STOP to GCS4MDRT7DEOZ6VRVS72J56D5E6XLAGU4G37ZLOVGUQPCOXZTKWIX5LO',
    })();
}
function sendDeleteEmail(email, source_account) {
    var subject = "You have unsubscribed from sputnik.";
    console.log("send to: "+ email);
    console.log(subject);

    gmailSend({
        user: credentials.user,                  // Your GMail account used to send emails
        pass: credentials.pass,                  // Application-specific password
        to:   email,
        subject: subject,
        text:    'Sorry to see you go.\nYou will no longer be notified when you receive payments to ' + source_account,
    })();
}
function sendEmail(email, tx_from, tx_amount, tx_asset) {
    var asset = tx_asset;
    if (asset === 'native') {
        asset = "Lumens";
    }
    var subject = "You have received "+ tx_amount + ' ' + asset + " from " + tx_from;
    console.log("send to: "+ email);
    console.log(subject);

    gmailSend({
        user: credentials.user,                  // Your GMail account used to send emails
        pass: credentials.pass,                  // Application-specific password
        to:   email,
        subject: subject,
        text:    'Thanks for using sputnik.\nTo unsubscribe, please send a payment transaction (can be as small as you like) with the memo STOP to\n GCS4MDRT7DEOZ6VRVS72J56D5E6XLAGU4G37ZLOVGUQPCOXZTKWIX5LO',
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


