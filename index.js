StellarSdk = require('stellar-sdk');
var server = new StellarSdk.Server('https://horizon.stellar.org');

var levelup = require('levelup');
var leveldown = require('leveldown');

var sputnikAccount = 'GCS4MDRT7DEOZ6VRVS72J56D5E6XLAGU4G37ZLOVGUQPCOXZTKWIX5LO';
// 1) Create our store
var db = levelup(leveldown('./mydb'));

var localCache = {};

var sputnikTxHandler = function (txResponse) {
    var source_account = txResponse.source_account;
    if (source_account === sputnikAccount) {
        return;
    }
    var email = '';
    if (txResponse.memo_type !== 'text') {
        return;
    }
    email = txResponse.memo.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi)[0];

    console.log("Check if they have email: " + email);
    console.log("whats the account to watch?: "+source_account);
    txResponse.operations().then(function (responses) {
        var operations = responses._embedded.records;
        var amount = 0;
        for (var i = 0; i<operations.length; i++) {
            if (operations[i].type === 'payment' && operations[i].asset_type === 'native') {
                amount += operations[i].amount;
            }
        }
        console.log("Did they deposit at least 3 lumens?");
        console.log(amount);
        if (amount >= 3.0) {
            localCache[source_account] = email;
            db.put(source_account, email, function (err) {
                if (err) return console.log('Ooops!', err) // some kind of I/O error
                console.log("saved email")
            })
        }
    });
};
function sendEmail(email, tx_from, tx_amount, tx_asset) {
    var asset = tx_asset;
    if (asset === 'native') {
        asset = "Lumens";
    }
    var text = "You have received "+ tx_amount + ' of ' + asset + " from " + tx_from;
    console.log("send to: "+ email);
    console.log(text);
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
