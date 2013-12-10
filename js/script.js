var API_BASE = "https://data.mtgox.com/api/2/";
var globalAuth;

function ApiAuth(key, secret) {
    this.key = key;
    this.secret = secret;
};

ApiAuth.prototype.generateHash = function(path, data) {
    secret = CryptoJS.enc.Base64.parse(this.secret);
    var message = path + String.fromCharCode(0) + data;
    var digest = CryptoJS.HmacSHA512(message, this.secret);
    var result = CryptoJS.enc.Base64.stringify(digest);
    return result;
};

ApiAuth.prototype.tonce = function() {
    return new Date().getTime();
};

ApiAuth.prototype.nonce = function() {
    return new Date().getTime();
};

ApiAuth.prototype.encodeObjectToUri = function(obj) {
    var str = [];
    for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
            str.push(encodeURI(p) + "=" + encodeURI(obj[p]));
        }
    }
    return str.join("&");
};

ApiAuth.prototype.getParameters = function(path) {
    var params = {
        'tonce': this.tonce(),
        'nonce': this.nonce()
    };
    
    var url = this.encodeObjectToUri(params);
    var data = this.encodeObjectToUri(params);
    
    var headers = {
        'Rest-Key': this.key,
        'Rest-Sign': this.generateHash(path, data)
    };
    
    return {url:url, params: params, data: data, headers: headers};
};

function ApiRequester() { }

ApiRequester.prototype.runRequest = function(path, params, auth, callback) {
    if (params == null) {
        params = {};
    }

    // Logging stuff
    //echo.info("Running API request. base='%s', path='%s', params=%s" % (BASE_PATH, path, params))

    var url = API_BASE + path;
    if (auth != null) {
        var params = auth.getParameters(path);
        if (params.url.length > 0) {
            url = url + '?' + params.url;
        }
        
        $.ajax({
            url: url,
            type: 'post',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Rest-Key': params.headers['Rest-Key'],
                'Rest-Sign': params.headers['Rest-Sign']
            },
            dateType: 'json',
            error: function(jqXHR, textStatus, errorThrown) {
                callback(new Error("Error: Request failed (" + textStatus + ")"));
                return;
            },
            success: function(json, textStatus, jqXHR) {
                callback(JSON.parse(json));
                return;
            }
        });
    } else {
        $.getJSON(API_BASE + "BTCUSD/money/ticker", function(data) {
            if (data.result != "success") {
                callback(new Error("Error: Unable to retrieve price"));
            }

            data = data.data; // unwrap the json
            callback(data);
        });
    }
};

var MTGOX_CHANNELS = {
    trade: 'dbf1dee9-4f2e-4a08-8cb7-748919a71b21',
    depth: '24e67e0d-1cad-4cc0-9e7a-f8523ef460fe',
    ticker: 'd5f06780-30a8-4a48-a2f8-7ed181b4a13f'
};
    
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
    var fixed = n.toFixed(DECIMAL_PLACES[currency]);
    
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
                var result = formatCurrency(bid, 'USD');
                var delta = formatDelta(bid - ask, 'USD');
                return result + " (" + delta + ")";
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
            
            if (globalAuth === null) {
                self.error("Error: Authentication required. Use 'auth' command.");
                return;
            }
            
            self.pause();
            var url = "BTCUSD/money/ticker";
            var requester = new ApiRequester();
            
            requester.runRequest(url, {}, globalAuth, function(data) {
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
                        var ticker = data.ticker;
                        var currency = ticker.buy.currency;
                        message += "[ticker] " +
                            "bid: " + currency + " " + ticker.buy.value + " | " +
                            "ask: " + currency + " " + ticker.sell.value;
                        break;
                    case "trade":
                        // [trade] bid: BTC 2.32000000 @ USD 800.23190
                        var trade = data.trade;
                        var currency = trade.price_currency;
                        var trade_amount = fixedIntToString(trade.amount_int, DECIMAL_PLACES.BTC);
                        price = fixedIntToString(trade.price_int, DECIMAL_PLACES[currency]);

                        message += "[trade] " +
                            trade.trade_type + ": " +
                            "BTC " + trade_amount + " " +
                            "@ " + currency + " " + price;
                        break;
                    case "depth":
                        // [depth] ask: @ USD 14.13000 | BTC -2.71000000 -> BTC 8.49766000
                        var depth = data.depth;
                        var currency = depth.currency;
                        var price = fixedIntToString(depth.price_int, DECIMAL_PLACES[currency]);
                        var volume = fixedIntToString(depth.volume_int, DECIMAL_PLACES.BTC);
                        var total_volume = fixedIntToString(depth.total_volume_int, DECIMAL_PLACES.BTC);

                        // TODO: move these variables out to pretty it up
                        message += "[depth] " +
                            depth.type_str + ": " +
                            "@ " + currency + " " + price + " | " +
                            "BTC " + volume + " " +
                            "-> BTC " + total_volume;
                        break;
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
        
        auth: function(key, secret) {
            var self = this;
            globalAuth = new ApiAuth(key, secret);
            
            self.echo("API authentication keys set.");
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