/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the “License”);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an “AS IS” BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 // First add the obligatory web framework
var express = require('express');
var app = express();
var bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({
  extended: false
}));

// Util is handy to have around, so thats why that's here.
const util = require('util')
// and so is assert
const assert = require('assert');

// We want to extract the port to publish our app on
var port = process.env.PORT || 8080;

// Then we'll pull in the database client library
var cassandra = require('cassandra-driver');

// Use the address translator
var compose = require('composeaddresstranslator');

// Now lets get cfenv and ask it to parse the environment variable
var cfenv = require('cfenv');
var appenv = cfenv.getAppEnv();

// Within the application environment (appenv) there's a services object
var services = appenv.services;

// The services object is a map named by service so we extract the one for PostgreSQL
var scylladb_services = services["compose-for-scylladb"];

// This check ensures there is a services for MySQL databases
assert(!util.isUndefined(scylladb_services), "Must be bound to compose-for-scylladb services");

// We now take the first bound MongoDB service and extract it's credentials object
var credentials = scylladb_services[0].credentials;

// get a username and password from the uri
const url = require('url');
myURL = url.parse(credentials.uri);
auth = myURL.auth;
splitAuth = auth.split(":");
username = splitAuth[0];
password = splitAuth[1];

// get contactPoints for the connection
translator=new compose.ComposeAddressTranslator();
translator.setMap(credentials.maps);

var authProvider = new cassandra.auth.PlainTextAuthProvider(username, password)
var uuid = require('uuid')

client = new cassandra.Client({
                        contactPoints: translator.getContactPoints(),
                        policies: {
                            addressResolution: translator
                        },
                        authProvider: authProvider
                      });

// create a keyspace and a table if they don't already exist
client.execute("CREATE KEYSPACE IF NOT EXISTS examples WITH replication = {'class': 'SimpleStrategy', 'replication_factor': '3' };", function(error,result){
  if (error) {
      console.log(error);
    } else {
      console.log(result);
      client.execute("CREATE TABLE IF NOT EXISTS examples.words (my_table_id uuid, word text, definition text, PRIMARY KEY(my_table_id));", function(err,res){
        if (err) {
            console.log(err);
          } else {
            console.log(res);
          }
      });
    }
});

// We can now set up our web server. First up we set it to serve static pages
app.use(express.static(__dirname + '/public'));

app.put("/words", function(request, response) {

  client.execute("INSERT INTO examples.words(my_table_id, word, definition) VALUES(?,?,?)",
     [uuid.v4(), request.body.word, request.body.definition],
     { prepare: true },
     function(error, result) {
       if (error) {
           console.log(error);
           response.status(500).send(error);
         } else {
           console.log(result.rows);
           response.send(result.rows);
         }
     });

});

// Read from the database when someone visits /hello
app.get("/words", function(request, response) {

    // execute a query on our database
    client.execute('SELECT * FROM examples.words', function (err, result) {
      if (err) {
        console.log(err);
       response.status(500).send(err);
      } else {
        console.log(result.rows);
       response.send(result.rows);
      }

    });

});

// Now we go and listen for a connection.
app.listen(port);

require("cf-deployment-tracker-client").track();
