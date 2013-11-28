var API_BASE = "https://data.mtgox.com/api/2/";

// Filled out with the login feature
var MTGOX_AUTH_KEYS = {
    key: null,
    secret: null
};

var MTGOX_CHANNELS = {
    trade: 'dbf1dee9-4f2e-4a08-8cb7-748919a71b21',
    depth: '24e67e0d-1cad-4cc0-9e7a-f8523ef460fe',
    ticker: 'd5f06780-30a8-4a48-a2f8-7ed181b4a13f'
};

function generateHash(secret, path, data) {
    secret = CryptoJS.enc.Base64.parse(secret);
    var message = path + String.fromCharCode(0) + data;
    var digest = CryptoJS.HmacSHA512(message, secret);
    var result = CryptoJS.enc.Base64.stringify(digest);
    return result;
}

function asyncTermApiCall(func, context, callback) {
    var self = context;
    
    self.pause();
    func(function(data) {
        if (data instanceof Error) {
            self.error(data.message);
            self.resume();
            return;
        }
        
        callback(data);
        self.resume();
    });
}

function currentPrice(callback) {
    $.getJSON(API_BASE + "BTCUSD/money/ticker", function(data) {
        if (data.result != "success") {
            callback(new Error("Error: Unable to retrieve price"));
        }

        data = data.data; // unwrap the json
        callback(data);
    });
}

function makeArray() {
    for (i = 0; i<makeArray.arguments.length; i++)
    this[i + 1] = makeArray.arguments[i];
}

/*
function getDateTime() {
    var months = new makeArray('January', 'February',' March', 'April', 'May',
    'June','July','August','September','October','November','December');
    var date = new Date();
    var day = date.getDate();
    var month = date.getMonth() + 1;
    var yy = date.getYear();
    var year = (yy < 1000) ? yy + 1900 : yy;
    
    var hours = date.getHours() % 12;
    var minutes = date.getMinutes();
    var s = date.getSeconds();
    var seconds = (s < 10) ? "0" + s : s;
    
    var period = getDayPeriod();
    function getDayPeriod() {
        var hours = date.getHours();
        if (hours === 0) return "MD"; // midnight
        if (hours > 0 && hours < 12) return "AM";
        if (hours == 12) return "NN"; // noon
        if (hours > 12 && hours < 23) return "PM";
    }

    return day + " " + months[month] + " " + year + " | " 
        + hours + ":" + minutes + ":" + seconds + " " + period + " | ";
    // "24 November 2013 | 4:15:32 PM | "
}
*/

function getFormattedDateTime() {
    // "24 November 2013 | 04:15:32 PM | "
    return moment().format("DD MMM YYYY [|] hh:mm:ss.SSS A [| ]");
}

var DECIMAL_PLACES = {
    BTC: 8,
    USD: 5
};

function stringRepeat(str, n) {
    n = n || 1;
    return Array(n+1).join(str);
}

function fixedIntToString(amount, places) {
    var n = amount.toString();
    
    var sign;
    if (n[0] === '-') {
        sign = '-';
        n = n.slice(1, -1);
    } else {
        sign = '';
    }
    
    if (n.length == places) {
        return sign + "0." + n;
    }
    
    if (n.length < places) {
        var zeros = stringRepeat('0', places - n.length);
        return sign + "0." + zeros + n;
    }
    
    var fractional = n.slice(n.length - places, -1);
    
    // Add padding zeros
    if (fractional.length < places) {
        var zeros = stringRepeat('0', places - fractional.length);
        fractional += zeros;
    }
    
    var whole = n.slice(0, n.length - places);
    return sign + whole + "." + fractional;
}

function formatDelta(delta, currency) {
    var formattedCurrency = currency.toUpperCase();
    var n = floorCurrency(delta, currency);
    var fixed = n.toFixed(DECIMAL_PLACES[currency])
    
    if (n === 0) {
        return formattedCurrency + " &plusmn;0";
    } else if (n > 0) {
        return formattedCurrency + " +" + fixed;
    } else {
        // Minus ia already included
        return formattedCurrency + fixed;
    }
}

function floorCurrency(n, currency) {
    return Math.floor10(n, -DECIMAL_PLACES[currency]);
}

function formatCurrency(n, currency) {
    var formattedCurrency = currency.toUpperCase();
    return formattedCurrency + " " + floorCurrency(n, currency);
}

jQuery(document).ready(function($) {
    $('body').terminal({
        n: function() {
            var self = this;
            self.exec('price', false);
        },
        now: function() {
            var self = this;
            self.exec('price', false);
        },
        p: function() {
            var self = this;
            self.exec('price', false);
        },
        price: function() {
            var self = this;
            
            asyncTermApiCall(currentPrice, self, function(data) {
                self.echo("Bid: " + data.buy.currency + " " + data.buy.value);
                self.echo("Ask: " + data.sell.currency + " " + data.sell.value);
            });
        },
        profit: function(money, buy, sell) {
            var self = this;
            
            function generateMessage(money, buy, sell) {
                var result = (money / buy) * sell;
                var delta = result - money;
                return formatDelta(delta, 'USD');
            }

            if (buy === "now" && isFinite(sell)) {
                /*
                currentPrice(function(data) {
                    if (data instanceof Error) {
                        self.error(data.message);
                        self.resume();
                        return;
                    }

                    // You buy at the sell price
                    buy = parseFloat(data.sell.value);
                    message = generateMessage(money, buy, sell);
                    self.echo(message);
                    self.resume();
                });
                */
                
                asyncTermApiCall(currentPrice, self, function(data) {
                    // You buy at the sell price
                    buy = parseFloat(data.sell.value);
                    message = generateMessage(money, buy, sell);
                    self.echo(message);
                });
            } else if (isFinite(buy) && sell === "now") {
                asyncTermApiCall(currentPrice, self, function(data) {
                    // You sell at the buy price
                    sell = parseFloat(data.buy.value);
                    message = generateMessage(money, buy, sell);
                    self.echo(message);
                });
            } else if (buy === "now" && sell === "now") {
                asyncTermApiCall(currentPrice, self, function(data) {
                    // You buy at the sell price
                    buy = parseFloat(data.sell.value);
                    // You sell at the buy price
                    sell = parseFloat(data.buy.value);

                    message = generateMessage(money, buy, sell);
                    self.echo(message);
                });
            } else if (isFinite(buy) && isFinite(sell)) {
                message = generateMessage(money, buy, sell);
                self.echo(message);
            }
        },
        target: function(ask, feePrecent) {
            var self = this;
            
            function f(ask) {
                var fee = 1 * feePrecent;
                var bid = (1 + fee)/((1 - fee) / ask);
                var str = formatCurrency(bid, 'USD');
                return str;
            }
            
            if (isFinite(ask)) {
                var result = f(ask);
                self.echo(result);
            } else if (ask === "now") {
                self.pause();

                currentPrice(function(data) {
                    if (data instanceof Error) {
                        self.error(data.message);
                        self.resume();
                        return;
                    }

                    // You buy at the sell price
                    ask = parseFloat(data.sell.value);
                    
                    var result = f(ask);
                    self.echo(result);
                    self.resume();
                });
            } else {
                throw new Error("Invalid value for ask price. Only a number or 'now' (to get the current ask price) is valid.");
            }
        },
        test: function() {
            var self = this;
            
            self.pause();
            $.getJSON(API_BASE + "BTCUSD/money/ticker", function(data) {
                self.echo(data.result);
                self.resume();
            });
        },
        stream: function() {
            var self = this;
            
            self.echo("Connecting to stream...");
            self.pause();
            var socket = io.connect('https://socketio.mtgox.com/mtgox');
            
            socket.on('message', function(data) {
                var message = getFormattedDateTime();
                
                switch (data.private) {
                    case "ticker":
                        // [ticker] bid: USD 800.23190 | ask: 802.13200
                        ticker = data.ticker;
                        currency = ticker.buy.currency;
                        message += "[ticker] " 
                            + "bid: " + currency + " " + ticker.buy.value + " | "
                            + "ask: " + currency + " " + ticker.sell.value;
                        break;
                    case "trade":
                        // [trade] bid: BTC 2.32000000 @ USD 800.23190
                        trade = data.trade;
                        currency = trade.price_currency
                        message += "[trade] " 
                            + trade.trade_type + ": " 
                            + "BTC " + fixedIntToString(trade.amount_int, DECIMAL_PLACES.BTC) + " "
                            + "@ " + currency + " " + fixedIntToString(trade.price_int, DECIMAL_PLACES[currency]);
                        break;
                    case "depth":
                        // [depth] ask: @ USD 14.13000 | BTC -2.71000000 -> BTC 8.49766000
                        depth = data.depth;
                        currency = depth.currency;
                        message += "[depth] "
                            + depth.type_str + ": "
                            + "@ " + currency + " " + fixedIntToString(depth.price_int, DECIMAL_PLACES[currency]) + " | "
                            + "BTC " + fixedIntToString(depth.volume_int, DECIMAL_PLACES.BTC) + " "
                            + "-> BTC " + fixedIntToString(depth.total_volume_int, DECIMAL_PLACES.BTC);
                }
                
                self.echo(message);
                self.resume();
                self.pause();
            });
        },
        loop: function() {
            var self = this;
            
            self.pause();
            
            var i = 0;
            function onLoop() {
                self.echo("[" + i + "] = " + Math.random() * 1000.0);
                i++;
                self.resume();
                self.pause();
            }
            
            (function loop() {
                var rand = Math.round(Math.random() * 100) + 50;
                setTimeout(function() {
                    onLoop();
                    loop();
                }, rand);
            }());
        },
        test_hash: function(secret, path, data) {
            var self = this;
            
            self.echo("=> " + generateHash(secret, path, data));
        }
    }, {
        prompt: '> ',
        greetings: "GoxTerm alpha\nCopyright 2013 Joshua Bowden\n"
    });
});