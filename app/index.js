StellarSdk = require('stellar-sdk')
http = require('http');

var PORT = process.env.PORT || 5000

var jsserver = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World\n');
});

jsserver.listen(PORT, ()=> {
    console.log('server running');
    var server = new StellarSdk.Server('https://horizon.stellar.org');
    var lastCursor=0; // or load where you left off

    var txHandler = function (txResponse) {
        console.log(txResponse);
        console.log(txResponse.memo);


    };
    var accountAddress = 'GAGPGK3JBUJS3Z6XWGSECWA6FHJM7RMVGRQEOC2CKC7D6CVAY3EXJKBQ';
    var es = server.transactions()
        .forAccount(accountAddress)
        .cursor(lastCursor)
        .stream({
            onmessage: txHandler
        })
});

