const express = require('express');
const router = express.Router();
const winston = require('winston');

const {
  format,
  transports,
  config
} = require('winston');
const {
  combine,
  timestamp,
  json
} = format;

const appRoot = require('app-root-path');
const db = require('../config/database');
const Gig = require('../Model/user');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const bcrypt = require("bcrypt");
var validator = require("email-validator");
var passwordValidator = require('password-validator');
var schema = new passwordValidator();

var SDC = require('statsd-client'),
  sdc = new SDC({
    host: "localhost",
    port: 8125
  });

var options = {
  infoFile: {
    level: 'info',
    filename: `${appRoot}/logs/info.log`,
    handleExceptions: true,
    json: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    colorize: false,
    timestamp: true,
  },

  errorFile: {
    level: 'error',
    filename: `${appRoot}/logs/info.log`,
    handleExceptions: true,
    json: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    colorize: false,
    timestamp: true,
  }
};

// instantiate a new Winston Logger with the settings defined above
var logger = new winston.createLogger({

  defaultMeta: {
    service: 'user-api'
  },

  format: combine(
    timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    json()
  ),

  transports: [
    new winston.transports.File(options.infoFile),
    //new winston.transports.File(options.errorFile)
  ],

  exitOnError: false, // do not exit on handled exceptions
});

// create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
  write: function (message, encoding) {},
};

schema
  .is().min(8) // Minimum length 8
  .is().max(100) // Maximum length 100
  .has().uppercase() // Must have uppercase letters
  .has().lowercase() // Must have lowercase letters
  .has().digits() // Must have digits
  .has().not().spaces() // Should not have spaces
  .is().not().oneOf(['Passw0rd', 'Password123']);

//console.log(Gig);

// router.get('/', (req, res) =>
//   db.user.findAll()
//   .then(users => {
//     //console.log(users);
//     res.status(200).json({
//       message: res.statusCode,
//       users: users
//     });
//     logger.info("Calling the get user function");
//   })
//   .catch(err => console.log(err),
//                 logger.info(err)))
// module.exports = router;


//POST
router.post('/user', (req, res) => {
  sdc.increment('userPost.counter');
  sdc.gauge('some.gauge', 10); // Set gauge to 10
  var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
  sdc.histogram('some.histogram', 10, {
    foo: 'bar'
  }) // Histogram with tags
  ////
  db.user.findAll({
      where: {
        email: req.body.email
      }
    })
    .then(data => {
      if (data[0] == undefined) {
        let {
          first_name,
          last_name,
          email,
          password
        } = req.body;

        logger.info("Calling the post user Function");
        logger.info("Attempting to create User with emailId " + email);

        if (validator.validate(email) && schema.validate(password)) {

          bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
              logger.error(err);
              return res.status(401).json({
                  error: err
                }),
                logger.error("Status code :401 - error : " + err);
            } else {
              hash = String(hash);
              password = hash;
              var DBtimer = new Date();
              db.user.create({
                  first_name,
                  last_name,
                  email,
                  password
                })
                //.then(gig => res.redirect('/gigs'))
                .then(gig => res.status(201).json({
                    "id": gig.id,
                    "first_name": gig.first_name,
                    "last_name": gig.last_name,
                    "email_address": gig.email,
                    "account_created": gig.created_date,
                    "account_updated": gig.updated_date,
                  }),
                  logger.info("Created user Successfully and returns status code 201"),
                  sdc.timing('DBuserPost.timer', DBtimer) // Calculates time diff
                )
                .catch(err => {
                  console.log(err),
                    logger.error(err)
                });
            }
          });
        } else {
          res.status(400).json({
              message: "Invalid Email or password..!!",
              "password_guidelines: ": ["Minimum length 8", "Maximum length 100", "Must have uppercase letters",
                "Must have lowercase letters", "Must have digits", "Should not have spaces"
              ],
              "Status code": res.statusCode
            }),
            logger.error("Status code returned is 400 - requested user with emaiID " + email + " to follow the standards");
        }
      } else {
        res.status(400).json({
            message: "User Email exist.",
          }),
          logger.error("User email already exists");
      }
    });
  sdc.timing('userPost.timer', timer); // Calculates time diff
});


//GET

router.get('/user/self', (req, res) => {
  sdc.increment('userGet.counter');
  var timer = new Date();
  // check for basic auth header
  if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
    return res.status(401).json({
        message: 'Missing Authorization Header'
      }),
      logger.error("Header authorization Error");
  }

  // verify auth credentials
  const base64Credentials = req.headers.authorization.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [email, password] = credentials.split(':');
  //const result;
  var DBtimer = new Date();
  db.user.findAll({
      where: {
        email: email
      }
    })
    .then(data => {
      //console.log(data[0]+"*******************");
      if (data[0] != undefined) {
        //result = data;
        const db_password = data[0].password;
        console.log(db_password);
        console.log(password);
        console.log(email);
        bcrypt.compare(password, db_password, (err, result) => {
          console.log(result);
          if (err) {
            res.status(401).json({
                message: 'Bad Request'
              }),
              logger.error("Status code :401 - Bad request : " + err);
          } else if (result) {
            res.status(200).json({
                "id": data[0].id,
                "first_name": data[0].first_name,
                "last_name": data[0].last_name,
                "email_address": data[0].email,
                "account_created": data[0].created_date,
                "account_updated": data[0].updated_date
              }),
              logger.info("Got the user with email " + data[0].email + "successfully"),
              sdc.timing('DBuserPost.timer', DBtimer) // Calculates time diff
          } else {
            res.status(401).json({
                message: 'Unauthorized Access Denied'
              }),
              logger.error("Status code :401 - Unauthorized Access Denied");
          }
        });
      } else {
        //console.log(res);
        res.status(404).json({
            "message": "Email doesn't exist"
          }),
          logger.error("Status code :404 - Email doesn't exist"); // return wrong email
      }
    })
    .catch(err => {
      console.log(err),
        logger.error(err)
    })
  sdc.timing('userGet.timer', timer); // Calculates time diff

});



// PUT REQUEST

router.put('/user/self', function (req, res, next) {

  sdc.increment('userPut.counter');
  var timer = new Date();

  // check for basic auth header
  if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
    return res.status(401).json({
        message: 'Missing Authorization Header'
      }),
      logger.error("Header authorization Error");
  }

  // verify auth credentials
  const base64Credentials = req.headers.authorization.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [email, password] = credentials.split(':');
  //const result;
  db.user.findAll({
      where: {
        email: email
      }
    })
    .then(data => {
      //console.log(data[0]+"*******************");
      if (data[0] != undefined) {
        //result = data;
        const db_password = data[0].password;
        console.log(db_password);
        console.log(password);
        console.log(email);
        bcrypt.compare(password, db_password, (err, result) => {
          console.log(result);
          if (err) {
            res.status(400).json({
                message: 'Bad Request'
              }),
              logger.error("Status code :400 - Bad request : " + err);
          } else if (result) {
            let flag = false;
            if (req.body.email == undefined && req.body.updated_date == undefined && req.body.created_date == undefined) {
              flag = true;
            }
            if (flag) {
              if (schema.validate(req.body.password)) {
                bcrypt.hash(req.body.password, 10, (err, hash) => {
                  if (err) {
                    return res.status(401).json({
                        error: err
                      }),
                      logger.error("Status code :401 - error : " + err);
                  } else {
                    var DBtimer = new Date();

                    db.user.update({
                          first_name: req.body.first_name,
                          last_name: req.body.last_name,
                          password: hash
                        },
                        //{email: req.body.email},
                        {
                          returning: true,
                          where: {
                            email: email
                          }
                        },
                        logger.info("Updated data for the user with email : " + email),
                        sdc.timing('DBuserPost.timer', DBtimer) // Calculates time diff
                      )
                      .then(function ([rowsUpdate, [updatedDetail]]) {
                        res.json(updatedDetail),
                          logger.info("Updated :" + updatedDetail)
                      })
                      .catch(next => {
                        logger.error(next),
                          console.log(next)
                      })
                  }
                })
              } else {
                res.status(401).json({
                    message: "Invalid password"
                  }),
                  logger.error("Status code :401 - Invalid Password");
              }


              ///////////
            } else {
              res.status(400).json({
                  message: "Email, created date, updated date cannot be updated."
                }),
                logger.error("Status code :400 - Email, created date, updated date cannot be updated.");
            }
            // res.status(200).json({
            //   "first_name": data[0].first_name,
            //   "last_name": data[0].last_name,
            //   "email": data[0].email,
            //   "created_date": data[0].created_date,
            //   "updated_date": data[0].updated_date
            // });
          } else {
            res.status(401).json({
                message: 'Unauthorized Access Denied'
              }),
              logger.error("Status code :401 - Unauthorized Access Denied");
          }
        });
      } else {
        //console.log(res);
        res.status(400).json({
            "message": "Email doesn't exist"
          }),
          logger.error("Status code :400 - Email doesn't exist"); // return wrong email
      }
    })
    .catch(err => {
      logger.error(err)
      console.log(err)
    })
  sdc.timing('userPut.timer', timer); // Calculates time diff
});

module.exports = router;

var AWS = require('aws-sdk');
// Set region
AWS.config.update({
  region: 'us-east-1'
});


const dotenv = require('dotenv');
dotenv.config();
router.post('/myrecipes', (req, res) => {

  // check for basic auth header
  if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
    return res.status(401).json({
        message: 'Missing Authorization Header'
      }),
      logger.error("Recepie Post method: Header authorization Error Status : 401");
  }

  // verify auth credentials
  const base64Credentials = req.headers.authorization.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [email, password] = credentials.split(':');
  //const result;

  db.user.findAll({
      where: {
        email: email
      }
    })
    .then(data => {
      console.log(data);
      if (data.length <= 0) {
        return res.status(400).json({
            "message": "Email doesn't exist"
          }),
          logger.error("ALL Recepie POST method: Status code :400 - Email " + email + " doesn't exist");
      }
      let user_authorized = false;
      const author_id = data[0].id;
      if (data[0] != undefined) {
        const db_password = data[0].password;
        bcrypt.compare(password, db_password, (err, result) => {

          //result= true;
          if (err) {
            res.status(400).json({
                message: 'Bad Request'
              }),
              logger.error("ALL Recepie Post method : Status code :400 - Bad request : " + err);
          } else if (result) {

            db.recipe.findAll({
                where: {
                  userId: author_id
                }
              })
              .then(data => {
                if (data.length > 0) {

                  var array_id = email;//= [];
                  for (var i = 0; i < data.length; i++) {
                    array_id=array_id+" "+data[i].id;
                  }

                  const SNS_TOPIC_ARN = process.env.topic_arn;
                  const sns = new AWS.SNS();

                  // Scaffold a self-executing async function (so we can use await!)
                  (async () => {
                    try {
                      // Create the event object
                      const publishParameters = {
                        //Id: author_id,
                        Message: array_id,
                        TopicArn: SNS_TOPIC_ARN
                      };

                      // Publish and wait using a promise
                      const result = await sns.publish(publishParameters).promise();
                      // Log the result
                      console.log(`Published to ${SNS_TOPIC_ARN}! ${result}`);
                      res.status(200).send(JSON.stringify({
                        "Request": "SENT"
                      }));
                    } catch (error) {
                      // Log any errors we get here.
                      console.error(`Unable to publish to SNS: ${error.stack}`);
                    }
                  })();

                  res.header("Content-Type", 'application/json');

                  // res.status(200).send(JSON.stringify(
                  //     array_id
                  //   )),
                    logger.info("Recipe Post method : Posted the recipie " + data.title + " for the authorized user with email " + email + " successfully")
                } else {
                  res.status(200).send(JSON.stringify({
                    "message": "No recipe for this user"
                  }))
                }




              })
              .catch(err => {
                res.status(406).json({
                    message: err.message
                  }),
                  logger.error("ALL Recipe POST method : Error with status code : 406. Error : " + err.message)
              });

          } else {
            res.status(401).json({
                message: 'Unauthorized Access Denied'
              }),
              logger.error("Recipe Post method : Error while posting the recipe error code - 401, Unauthorized Access Denied")
          }
        })
      } else {
        res.status(400).json({
            "message": "Email doesn't exist"
          }),
          logger.error("Recipe Post method : Error while posting the recipe error code - 400, Email " + email + " doesn't exist") // return wrong email
      }
    })
    .catch();
});