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
const bcrypt = require("bcrypt");
const AWS = require('aws-sdk');
const Busboy = require('busboy');
const dotenv = require('dotenv');
dotenv.config();
const BUCKET_NAME = process.env.BUCKET_NAME
//'webapp.dev.ajaygoel.me';
// const IAM_USER_KEY = 'AKIA2XLRXCUPYQ4KMUHG';
// const IAM_USER_SECRET = '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';

AWS.config.credentials = new AWS.EC2MetadataCredentials({
    httpOptions: { timeout: 5000 }, // 5 second timeout
    maxRetries: 10, // retry 10 times
    retryDelayOptions: { base: 200 } // see AWS.Config for information
  });

const IAM_USER_KEY = process.env.DEV_ADMIN_IAM_USER_KEY;
const IAM_USER_SECRET = process.env.DEV_ADMIN_IAM_USER_SECRET;

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
    },

    errorFile: {
        level: 'error',
        filename: `${appRoot}/logs/info.log`,
        handleExceptions: true,
        json: true,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        colorize: false,
    }
};

// instantiate a new Winston Logger with the settings defined above
var logger = new winston.createLogger({

    defaultMeta: {
        service: 'recipe-api'
    },

    format: combine(
        timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        json()
    ),

    transports: [
        new winston.transports.File(options.infoFile),
    ],
    exitOnError: false, // do not exit on handled exceptions
});

// create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
    write: function (message, encoding) {
        // use the 'info' log level so the output will be picked up by both transports (file and console)
        //logger.info(message);
    },
};

////POST

router.post('/recipie', (req, res) => {

    sdc.increment('recipePost.counter');
    sdc.gauge('some.gauge', 10); // Set gauge to 10
    var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
    sdc.histogram('some.histogram', 10, {
      foo: 'bar'
    })

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
                    logger.error("Recepie Post method: Status code :400 - Email " + email + " doesn't exist");
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
                            logger.error("Recepie Post method : Status code :400 - Bad request : " + err);
                    } else if (result) {

                        const {
                            title,
                            cook_time_in_min,
                            prep_time_in_min,
                            cusine,
                            servings,
                            ingredients,
                            steps,
                            nutritionInformation
                        } = req.body;

                        const calories = nutritionInformation.calories;
                        const cholesterol_in_mg = nutritionInformation.cholesterol_in_mg;
                        const sodium_in_mg = nutritionInformation.sodium_in_mg;
                        const carbohydrates_in_grams = nutritionInformation.carbohydrates_in_grams;
                        const protein_in_grams = nutritionInformation.protein_in_grams;

                        //console.log(nutritionInformation);
                        const total_time_in_min = cook_time_in_min + prep_time_in_min;

                        var DBtimer = new Date();
                        db.recipe.create({
                                author_id,
                                title,
                                cook_time_in_min,
                                prep_time_in_min,
                                total_time_in_min,
                                cusine,
                                servings,
                                ingredients,
                                steps,
                                "userId": author_id
                            })
                            .then(data => db.nutInfo.create({
                                    "recipe_id": data.id,
                                    calories,
                                    cholesterol_in_mg,
                                    sodium_in_mg,
                                    carbohydrates_in_grams,
                                    protein_in_grams,
                                    "recipeId": data.id

                                })
                                .then(nutrition_information => db.recipeSteps.create({
                                        "recipe_id": data.id,
                                        steps,
                                        "recipeId": data.id
                                    })
                                    .then(recipeSteps => {
                                        res.header("Content-Type", 'application/json');

                                        res.status(200).send(JSON.stringify(

                                            {
                                                "id": data.id,
                                                "created_ts": data.created_date,
                                                "updated_ts": data.updated_date,
                                                "author_id": data.author_id,
                                                "cook_time_in_min": data.cook_time_in_min,
                                                "prep_time_in_min": data.prep_time_in_min,
                                                "total_time_in_min": data.total_time_in_min,
                                                "title": data.title,
                                                "cusine": data.cusine,
                                                "servings": data.servings,
                                                "ingredients": data.ingredients,
                                                "steps": recipeSteps.steps,
                                                "nutrition_information": {
                                                    "calories": nutrition_information.calories,
                                                    "cholesterol_in_mg": nutrition_information.cholesterol_in_mg,
                                                    "sodium_in_mg": nutrition_information.sodium_in_mg,
                                                    "carbohydrates_in_grams": nutrition_information.carbohydrates_in_grams,
                                                    "protein_in_grams": nutrition_information.protein_in_grams
                                                }
                                            }
                                        )), 
                                        logger.info("Recipe Post method : Posted the recipie " + data.title + " for the authorized user with email " + email + " successfully"),
                                        sdc.timing('DBrecipePost.timer',DBtimer);// Calculates time diff
                                    }))
                            )
                            .catch(err => {
                                res.status(406).json({
                                        message: err.message
                                    }),
                                    logger.error("Recipe Post method : Error while posting the recipe error code - 406 " + err.message)
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
        sdc.timing('recipePost.timer',timer);

})
// ////POST

// router.post('/recipie', (req, res) => {

//     // check for basic auth header
//     if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
//         return res.status(401).json({
//             message: 'Missing Authorization Header'
//         });
//     }

//     // verify auth credentials
//     const base64Credentials = req.headers.authorization.split(' ')[1];
//     const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
//     const [email, password] = credentials.split(':');
//     //const result;

//     db.user.findAll({
//             where: {
//                 email: email
//             }
//         })
//         .then(data => {
//             console.log(data);
//             if (data.length <= 0) {
//                 return res.status(400).json({
//                     "message": "Email doesn't exist"
//                 }); // return wrong email
//             }
//             let user_authorized = false;
//             const author_id = data[0].id;
//             if (data[0] != undefined) {
//                 const db_password = data[0].password;
//                 bcrypt.compare(password, db_password, (err, result) => {

//                     //result= true;
//                     if (err) {
//                         res.status(400).json({
//                             message: 'Bad Request'
//                         });
//                     } else if (result) {

//                         const {
//                             title,
//                             cook_time_in_min,
//                             prep_time_in_min,
//                             cusine,
//                             servings,
//                             ingredients,
//                             steps,
//                             nutritionInformation,
//                             url
//                         } = req.body;

//                         const calories = nutritionInformation.calories;
//                         const cholesterol_in_mg = nutritionInformation.cholesterol_in_mg;
//                         const sodium_in_mg = nutritionInformation.sodium_in_mg;
//                         const carbohydrates_in_grams = nutritionInformation.carbohydrates_in_grams;
//                         const protein_in_grams = nutritionInformation.protein_in_grams;

//                         //console.log(nutritionInformation);
//                         const total_time_in_min = cook_time_in_min + prep_time_in_min;


//                         db.recipe.create({
//                                 author_id,
//                                 title,
//                                 cook_time_in_min,
//                                 prep_time_in_min,
//                                 total_time_in_min,
//                                 cusine,
//                                 servings,
//                                 ingredients,
//                                 steps,
//                                 "userId": author_id
//                             })
//                             .then(data => db.nutInfo.create({
//                                     "recipe_id": data.id,
//                                     calories,
//                                     cholesterol_in_mg,
//                                     sodium_in_mg,
//                                     carbohydrates_in_grams,
//                                     protein_in_grams,
//                                     "recipeId": data.id

//                                 })
//                                 .then(nutrition_information => db.recipeSteps.create({
//                                         "recipe_id": data.id,
//                                         steps,
//                                         "recipeId": data.id
//                                     })
//                                     .then(recipeSteps => db.image.create({
//                                             "recipe_id": data.id,
//                                             url,
//                                             "recipeId": data.id
//                                         })
//                                         .then(image_inserted => {
//                                             res.header("Content-Type", 'application/json');

//                                             res.status(200).send(JSON.stringify({
//                                                 "image": {
//                                                     "id": image_inserted.image_id,
//                                                     "url": image_inserted.url
//                                                 },
//                                                 "id": data.id,
//                                                 "created_ts": data.created_date,
//                                                 "updated_ts": data.updated_date,
//                                                 "author_id": data.author_id,
//                                                 "cook_time_in_min": data.cook_time_in_min,
//                                                 "prep_time_in_min": data.prep_time_in_min,
//                                                 "total_time_in_min": data.total_time_in_min,
//                                                 "title": data.title,
//                                                 "cusine": data.cusine,
//                                                 "servings": data.servings,
//                                                 "ingredients": data.ingredients,
//                                                 "steps": recipeSteps.steps,
//                                                 "nutrition_information": {
//                                                     "calories": nutrition_information.calories,
//                                                     "cholesterol_in_mg": nutrition_information.cholesterol_in_mg,
//                                                     "sodium_in_mg": nutrition_information.sodium_in_mg,
//                                                     "carbohydrates_in_grams": nutrition_information.carbohydrates_in_grams,
//                                                     "protein_in_grams": nutrition_information.protein_in_grams
//                                                 }
//                                             }));

//                                         })

//                                         // ));
//                                         //})
//                                     )
//                                 )
//                             )
//                             .catch(err => res.status(406).json({
//                                 message: err.message
//                             }));


//                     } else {
//                         res.status(401).json({
//                             message: 'Unauthorized Access Denied'
//                         });
//                     }
//                 })
//             } else {
//                 res.status(400).json({
//                     "message": "Email doesn't exist"
//                 }); // return wrong email
//             }
//         })
//         .catch();

// })

////// DELETE
////// DELETE

router.delete('/recipie/:id', (req, res) => {

    sdc.increment('deleteRecipe.counter');
    sdc.gauge('some.gauge', 10); // Set gauge to 10
    var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
    sdc.histogram('some.histogram', 10, {
      foo: 'bar'
    })


    // check for basic auth header
    if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
        return res.status(401).json({
                message: 'Missing Authorization Header'
            }),
            logger.error("Recepie Delete method: Header authorization Error Status : 401");
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
                    logger.error("Recepie Delete method: Status code :400 - Email " + email + " doesn't exist"); // return wrong email
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
                            logger.error("Recepie Post method : Status code :400 - Bad request : " + err);
                    } else if (result) {

                        const {
                            recipe_id
                        } = req.params.id;
                        var DBtimer = new Date();
                        db.recipe.destroy({
                                where: {
                                    id: req.params.id,
                                    author_id: author_id
                                }
                            })
                            // TODO-- delete nutrition also
                            .then(deletedRecipe => {
                                if (deletedRecipe > 0) {
                                    db.nutInfo.destroy({
                                            where: {
                                                recipe_id: req.params.id
                                            }
                                        })
                                        .then(
                                            deletedRecipeSteps => {
                                                db.recipeSteps.destroy({
                                                        where: {
                                                            recipe_id: req.params.id
                                                        }
                                                    })
                                                    .then(
                                                        deletedImage => {
                                                            db.image.destroy({
                                                                    where: {
                                                                        recipe_id: req.params.id
                                                                    }
                                                                })
                                                                .then(res.status(200).json({
                                                                    deletedRecipe
                                                                }), logger.info("Recipe Delete method : Deleted the recipie " + req.params.title + " for the authorized user with email " + email + " successfully")),
                                                                sdc.timing('DBdeleteRecipe.timer',DBtimer);// Calculates time diff
                                                        }

                                                    )

                                            }
                                        )
                                } else {
                                    res.status(404).json({
                                            Message: " Recipe ID Not Found"
                                        }),
                                        logger.error("Recipe Delete method : Recipe with the specified ID not found")
                                }

                            })
                            .catch(err => {
                                res.status(406).json({
                                        message: err.message
                                    }),
                                    logger.error("Recipe Delete method : Error while deleting a recipe error code - 406 " + err.message)
                            });
                    } else {
                        res.status(401).json({
                                message: 'Unauthorized Access Denied'
                            }),
                            logger.error("Recipe Delete method : Error while deleting the recipe error code - 401, Unauthorized Access Denied")
                    }
                })
            } else {
                res.status(404).json({
                        "message": "Email doesn't exist"
                    }),
                    logger.error("Recipe Delete method : Error while deleting the recipe error code - 404, Email " + email + " doesn't exist")
            }
        })

        .catch(err => {
            res.status(406).json({
                    message: err.message
                }),
                logger.error("Recipe Delete method : Error while deleting the recipe error code - 406")
        });
    // logger.error("Recipe Delete method : Error while deleting the recipe error code - 406")});
    sdc.timing('deleteRecipe.timer',timer);
});


module.exports = router;


//// Get by ID

router.get('/recipie/:id', (req, res) => {
    sdc.increment('recipeGet.counter');
    sdc.gauge('some.gauge', 10); // Set gauge to 10
    var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
    sdc.histogram('some.histogram', 10, {
      foo: 'bar'
    })
    db.recipe.findAll({
            where: {
                id: req.params.id
            }
        })
        .then(data => {

            if (data.length < 1) {
                logger.error("Recipe Get method : Error code : 404. Invalid Id");
                return res.status(404).json({
                    message: 'Invalid Id'
                });

            } else {
                console.log(data.length);
                var DBtimer = new Date();
                db.nutInfo.findAll({
                        where: {
                            recipe_id: req.params.id
                        }
                    })
                    .then(nutrition_information => {
                        db.image.findAll({

                                where: {
                                    recipe_id: req.params.id
                                }
                            })
                            .then(imageInformation => {
                                if (imageInformation.length > 0) {
                                    res.header("Content-Type", 'application/json');
                                    logger.info("Recipe Get method : Getting recipe with Id: " + data[0].id + " and image details successfully");
                                    res.status(200).send(JSON.stringify(

                                        {
                                            "image": {
                                                "id": imageInformation[0].image_id,
                                                "url": imageInformation[0].url
                                            },
                                            "id": data[0].id,
                                            "created_ts": data[0].created_date,
                                            "updated_ts": data[0].updated_date,
                                            "author_id": data[0].author_id,
                                            "cook_time_in_min": data[0].cook_time_in_min,
                                            "prep_time_in_min": data[0].prep_time_in_min,
                                            "total_time_in_min": data[0].total_time_in_min,
                                            "title": data[0].title,
                                            "cusine": data[0].cusine,
                                            "servings": data[0].servings,
                                            "ingredients": data[0].ingredients,
                                            "steps": data[0].steps,
                                            "nutrition_information": {
                                                "calories": nutrition_information[0].calories,
                                                "cholesterol_in_mg": nutrition_information[0].cholesterol_in_mg,
                                                "sodium_in_mg": nutrition_information[0].sodium_in_mg,
                                                "carbohydrates_in_grams": nutrition_information[0].carbohydrates_in_grams,
                                                "protein_in_grams": nutrition_information[0].protein_in_grams
                                            }
                                        }
                                    ));
                                } else {
                                    res.header("Content-Type", 'application/json');
                                    logger.info("Recipe Get method : Getting recipe with Id: " + data[0].id + " successful");
                                    res.status(200).send(JSON.stringify(

                                        {
                                            "image": "NO IMAGE PRESENT",
                                            "id": data[0].id,
                                            "created_ts": data[0].created_date,
                                            "updated_ts": data[0].updated_date,
                                            "author_id": data[0].author_id,
                                            "cook_time_in_min": data[0].cook_time_in_min,
                                            "prep_time_in_min": data[0].prep_time_in_min,
                                            "total_time_in_min": data[0].total_time_in_min,
                                            "title": data[0].title,
                                            "cusine": data[0].cusine,
                                            "servings": data[0].servings,
                                            "ingredients": data[0].ingredients,
                                            "steps": data[0].steps,
                                            "nutrition_information": {
                                                "calories": nutrition_information[0].calories,
                                                "cholesterol_in_mg": nutrition_information[0].cholesterol_in_mg,
                                                "sodium_in_mg": nutrition_information[0].sodium_in_mg,
                                                "carbohydrates_in_grams": nutrition_information[0].carbohydrates_in_grams,
                                                "protein_in_grams": nutrition_information[0].protein_in_grams
                                            }
                                        }
                                    ));
                                    sdc.timing('DBrecipeGet.timer',DBtimer);// Calculates time diff
                                }

                            })
                    })
            }
        })

        .catch(err => {
            res.status(406).json({
                    message: err.message
                }),
                logger.error("Recipe Get method : Error with status code : 406. Error : " + err.message)
        });


        sdc.timing('recipeGet.timer',timer);

});



// // PUT Recipe

// router.put('/recipie/:id', (req, res) => {

//     // check for basic auth header
//     if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
//         return res.status(401).json({
//             message: 'Missing Authorization Header'
//         });
//     }

//     // verify auth credentials
//     const base64Credentials = req.headers.authorization.split(' ')[1];
//     const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
//     const [email, password] = credentials.split(':');
//     //const result;

//     db.user.findAll({
//             where: {
//                 email: email
//             }
//         })
//         .then(data => {
//             console.log(data);
//             if (data.length <= 0) {
//                 return res.status(400).json({
//                     "message": "Email doesn't exist"
//                 }); // return wrong email
//             

//             let user_authorized = false;
//             const author_id = data[0].id;

//             db.recipe.findAll({
//                     where: {
//                         id: req.params.id,
//                         author_id: author_id

//                     }
//                 })
//                 .then(data => {
//                     console.log(data);
//                     if (data.length <= 0) {
//                         return res.status(401).json({
//                             "message": "Unauthorized user for given recipe id"
//                         }); // return wrong email
//                     }
//                 });



//             if (data[0] != undefined) {

//                 const db_password = data[0].password;
//                 bcrypt.compare(password, db_password, (err, result) => {

//                     //result= true;
//                     if (err) {
//                         res.status(400).json({
//                             message: 'Bad Request'
//                         });
//                     } else if (result) {

//                         const {
//                             title,
//                             cook_time_in_min,
//                             prep_time_in_min,
//                             cusine,
//                             servings,
//                             ingredients,
//                             steps,
//                             nutritionInformation,
//                             url
//                         } = req.body;

//                         const calories = nutritionInformation.calories;
//                         const cholesterol_in_mg = nutritionInformation.cholesterol_in_mg;
//                         const sodium_in_mg = nutritionInformation.sodium_in_mg;
//                         const carbohydrates_in_grams = nutritionInformation.carbohydrates_in_grams;
//                         const protein_in_grams = nutritionInformation.protein_in_grams;

//                         //console.log(nutritionInformation);
//                         const total_time_in_min = cook_time_in_min + prep_time_in_min;
//                         db.recipe.update({
//                                 title: title,
//                                 cook_time_in_min: cook_time_in_min,
//                                 prep_time_in_min: prep_time_in_min,
//                                 total_time_in_min: total_time_in_min,
//                                 cusine: cusine,
//                                 servings: servings,
//                                 ingredients: ingredients,
//                                 steps: steps //,
//                                 // "userId": author_id
//                             }, {
//                                 returning: true,
//                                 where: {
//                                     id: req.params.id,
//                                     author_id: author_id
//                                 }
//                             })
//                             .then(function ([rowsUpdate, [data]]) {
//                                 //data => 
//                                 db.nutInfo.update({
//                                         //"recipe_id": data.id,
//                                         calories: calories,
//                                         cholesterol_in_mg: cholesterol_in_mg,
//                                         sodium_in_mg: sodium_in_mg,
//                                         carbohydrates_in_grams: carbohydrates_in_grams,
//                                         protein_in_grams: protein_in_grams,
//                                         //"recipeId": data.id
//                                     }, {
//                                         returning: true,
//                                         where: {
//                                             recipe_id: data.id
//                                         }
//                                     })
//                                     .then(function ([rowsUpdated, [nutrition_information]]) {
//                                         //nutrition_information => {
//                                         db.recipeSteps.update({
//                                                 steps: steps
//                                             }, {
//                                                 returning: true,
//                                                 where: {
//                                                     recipe_id: data.id
//                                                 }
//                                             })
//                                             .then(function ([rowsUpdated, [imageInformation]]) {
//                                                 db.image.update({
//                                                         url: url
//                                                     }, {
//                                                         returning: true,
//                                                         where: {
//                                                             recipe_id: data.id
//                                                         }
//                                                     })
//                                                     .then(function ([rowsUpdated, [imageInformation1]]) {
//                                                         res.header("Content-Type", 'application/json');
//                                                         res.status(200).send(JSON.stringify({
//                                                             "image": {
//                                                                 "id": imageInformation1.image_id,
//                                                                 "url": imageInformation1.url
//                                                             },
//                                                             "id": data.id,
//                                                             "created_ts": data.created_date,
//                                                             "updated_ts": data.updated_date,
//                                                             "author_id": data.author_id,
//                                                             "cook_time_in_min": data.cook_time_in_min,
//                                                             "prep_time_in_min": data.prep_time_in_min,
//                                                             "total_time_in_min": data.total_time_in_min,
//                                                             "title": data.title,
//                                                             "cusine": data.cusine,
//                                                             "servings": data.servings,
//                                                             "ingredients": data.ingredients,
//                                                             "steps": data.steps,
//                                                             "nutrition_information": {
//                                                                 "calories": nutrition_information.calories,
//                                                                 "cholesterol_in_mg": nutrition_information.cholesterol_in_mg,
//                                                                 "sodium_in_mg": nutrition_information.sodium_in_mg,
//                                                                 "carbohydrates_in_grams": nutrition_information.carbohydrates_in_grams,
//                                                                 "protein_in_grams": nutrition_information.protein_in_grams
//                                                             }
//                                                         }));
//                                                     })
//                                             })



//                                     })
//                             })
//                             .catch(err =>
//                                 res.status(401).json({
//                                     message: "Error " + err.message
//                                 })
//                             );


//                     } else {
//                         res.status(401).json({
//                             message: 'Unauthorized Access Denied'
//                         });
//                     }
//                 })

//             } else {
//                 res.status(400).json({
//                     "message": "Email doesn't exist"
//                 }); // return wrong email
//             }
//         })
//         .catch();

// })

// PUT Recipe

router.put('/recipie/:id', (req, res) => {

    sdc.increment('recipePut.counter');
    sdc.gauge('some.gauge', 10); // Set gauge to 10
    var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
    sdc.histogram('some.histogram', 10, {
      foo: 'bar'
    })

    // check for basic auth header
    if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
        logger.error("Recepie Put method: Missing Authorization Header Error Status : 401");
        return res.status(401).json({
            message: 'Missing Authorization Header'
        });
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
                logger.error("Recepie Put method: Email doesnt exist Error Status : 400");
                return res.status(400).json({
                    "message": "Email doesn't exist"
                });
            }

            let user_authorized = false;
            const author_id = data[0].id;

            db.recipe.findAll({
                    where: {
                        id: req.params.id,
                        author_id: author_id

                    }
                })
                .then(data => {
                    console.log(data);
                    if (data.length <= 0) {
                        logger.error("Recepie Put method: Unauthorized user for given recipe id Error Status : 401");
                        return res.status(401).json({
                            "message": "Unauthorized user for given recipe id"
                        });
                    }
                });



            if (data[0] != undefined) {

                const db_password = data[0].password;
                bcrypt.compare(password, db_password, (err, result) => {

                    //result= true;
                    if (err) {
                        logger.error("Recepie Put method: Bad Request Error Status : 400  Error : " + err);
                        res.status(400).json({
                            message: 'Bad Request'
                        });
                    } else if (result) {

                        const {
                            title,
                            cook_time_in_min,
                            prep_time_in_min,
                            cusine,
                            servings,
                            ingredients,
                            steps,
                            nutritionInformation
                        } = req.body;

                        const calories = nutritionInformation.calories;
                        const cholesterol_in_mg = nutritionInformation.cholesterol_in_mg;
                        const sodium_in_mg = nutritionInformation.sodium_in_mg;
                        const carbohydrates_in_grams = nutritionInformation.carbohydrates_in_grams;
                        const protein_in_grams = nutritionInformation.protein_in_grams;

                        //console.log(nutritionInformation);
                        const total_time_in_min = cook_time_in_min + prep_time_in_min;
                        var DBtimer = new Date();
                        db.recipe.update({
                                title: title,
                                cook_time_in_min: cook_time_in_min,
                                prep_time_in_min: prep_time_in_min,
                                total_time_in_min: total_time_in_min,
                                cusine: cusine,
                                servings: servings,
                                ingredients: ingredients,
                                steps: steps //,
                                // "userId": author_id
                            }, {
                                returning: true,
                                where: {
                                    id: req.params.id,
                                    author_id: author_id
                                }
                            })
                            .then(function ([rowsUpdate, [data]]) {
                                //data => 
                                db.nutInfo.update({
                                        //"recipe_id": data.id,
                                        calories: calories,
                                        cholesterol_in_mg: cholesterol_in_mg,
                                        sodium_in_mg: sodium_in_mg,
                                        carbohydrates_in_grams: carbohydrates_in_grams,
                                        protein_in_grams: protein_in_grams,
                                        //"recipeId": data.id
                                    }, {
                                        returning: true,
                                        where: {
                                            recipe_id: data.id
                                        }
                                    })
                                    .then(function ([rowsUpdated, [nutrition_information]]) {
                                        //nutrition_information => {
                                        db.recipeSteps.update({
                                                steps: steps
                                            }, {
                                                returning: true,
                                                where: {
                                                    recipe_id: data.id
                                                }
                                            })
                                            .then(function ([rowsUpdated, [nutrition_information1]]) {
                                                res.header("Content-Type", 'application/json');

                                                res.status(200).send(JSON.stringify(

                                                    {
                                                        "id": data.id,
                                                        "created_ts": data.created_date,
                                                        "updated_ts": data.updated_date,
                                                        "author_id": data.author_id,
                                                        "cook_time_in_min": data.cook_time_in_min,
                                                        "prep_time_in_min": data.prep_time_in_min,
                                                        "total_time_in_min": data.total_time_in_min,
                                                        "title": data.title,
                                                        "cusine": data.cusine,
                                                        "servings": data.servings,
                                                        "ingredients": data.ingredients,
                                                        "steps": data.steps,
                                                        "nutrition_information": {
                                                            "calories": nutrition_information.calories,
                                                            "cholesterol_in_mg": nutrition_information.cholesterol_in_mg,
                                                            "sodium_in_mg": nutrition_information.sodium_in_mg,
                                                            "carbohydrates_in_grams": nutrition_information.carbohydrates_in_grams,
                                                            "protein_in_grams": nutrition_information.protein_in_grams
                                                        }
                                                    }
                                                ));
                                            })



                                    })
                                    
                            })
                            .catch(err => {
                                res.status(401).json({
                                        message: "Error " + err.message
                                    }),
                                    logger.error("Recepie Put method: Error Status code: 400. Error : " + err.message);
                            });
                            sdc.timing('DBrecipePut.timer',DBtimer);// Calculates time diff


                    } else {
                        logger.error("Recepie Put method: Unauthorized Access Denied. Error Status code: 401.");
                        res.status(401).json({
                            message: 'Unauthorized Access Denied'
                        });
                    }
                })

            } else {
                logger.error("Recepie Put method: Email doesn't exist. Error Status code: 400.");
                res.status(400).json({
                    "message": "Email doesn't exist"
                }); // return wrong email
            }
        })
        .catch();

        sdc.timing('recipePut.timer',timer);

})


module.exports = router;


// DELETE IMAGE
router.delete('/recipie/:id/image/:imageId', (req, res) => {

    sdc.increment('imageDelete.counter');
    sdc.gauge('some.gauge', 10); // Set gauge to 10
    var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
    sdc.histogram('some.histogram', 10, {
      foo: 'bar'
    })

    // check for basic auth header
    if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
        logger.error("Recepie Image-Delete method: Missing Authorization Header Error Status : 401");
        return res.status(401).json({
            message: 'Missing Authorization Header'
        });
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
                logger.error("Recepie Image-Delete method: Email Doesnt exist. Error Status : 400");
                return res.status(400).json({
                    "message": "Email doesn't exist"
                }); // return wrong email
            }
            let user_authorized = false;
            const author_id = data[0].id;
            if (data[0] != undefined) {
                const db_password = data[0].password;
                bcrypt.compare(password, db_password, (err, result) => {

                    //result= true;
                    if (err) {
                        logger.error("Recepie Image-Delete method: Bad Request. Error Status : 400  Error :" + err);
                        res.status(400).json({
                            message: 'Bad Request'
                        });
                    } else if (result) {

                        db.recipe.findAll({
                                where: {
                                    id: req.params.id,
                                    author_id: author_id

                                }
                            })
                            .then(data => {
                                console.log(data);
                                if (data.length <= 0) {
                                    logger.error("Recepie Image-Delete method: Unauthorized user for given recipe id. Error Status : 401");
                                    return res.status(401).json({
                                        "message": "Unauthorized user for given recipe id"
                                    }); // return wrong email
                                }
                            });

                        db.image.findAll({
                                where: {
                                    recipe_id: req.params.id
                                }
                            })
                            .then(image_data => {
                                if (image_data.length > 0) {

                                    if (image_data[0].image_id != req.params.imageId) {
                                        logger.error("Recepie Image-Delete method: No Image Id Found. Error Status : 404");
                                        res.status(404).json({
                                            message: "No Image Id Found"
                                        })
                                    } else {
                                        var k = '';

                                        db.image.findAll({
                                                where: {
                                                    recipe_id: req.params.id
                                                }
                                            })
                                            .then(image_data => {
                                                //if (image_data.length > 0) {
                                                //k=image_data[0].S3Key;
                                                //res.status(200).json({
                                                //console.log(image_data[0]);
                                                //console.log('here');
                                                //k = 
                                                console.log(image_data[0].S3Key)
                                                let s3bucket = new AWS.S3({
                                                    // accessKeyId: IAM_USER_KEY,
                                                    // secretAccessKey: IAM_USER_SECRET,
                                                    // Bucket: BUCKET_NAME
                                                });
                                                var S3Timer = new Date();
                                                s3bucket.deleteObject({
                                                    Bucket: BUCKET_NAME,
                                                    Key: image_data[0].S3Key
                                                }, function (err, data) {
                                                    if (err) {
                                                        console.log(err);
                                                    }
                                                    console.log(data);
                                                    var DBtimer = new Date();
                                                    db.image.destroy({
                                                            where: {
                                                                recipe_id: req.params.id
                                                            }
                                                        })
                                                        .then(deletedImage => {

                                                            //                                                console.log(deletedRecipe[0])
                                                            if (deletedImage > 0) {
                                                                // let s3bucket = new AWS.S3({
                                                                //     accessKeyId: IAM_USER_KEY,
                                                                //     secretAccessKey: IAM_USER_SECRET,
                                                                //     Bucket: BUCKET_NAME
                                                                // });
                                                                // s3bucket.deleteObject({
                                                                //     Bucket: BUCKET_NAME,
                                                                //     //Location: deletedImage.url //.name//,
                                                                //     Key: deletedImage[0].S3Key//file.data
                                                                // }, function (err, data) {
                                                                //     if (err) {
                                                                //         console.log(err);
                                                                //     }
                                                                //     console.log(data);
                                                                // })
                                                                logger.info("Recepie Image-Delete method: Deleted image successfully. Status : 200");
                                                                res.status(200).json({
                                                                    deletedImage
                                                                })
                                                            } else {
                                                                logger.error("Recepie Image-Delete method: Image not found. Error Status : 404");
                                                                res.status(404).json({
                                                                    Message: "Not Found"
                                                                })
                                                            }
                                                        })
                                                })
                                                sdc.timing('imageDelete.timer',S3Timer); // Calculates time diff
                                            })
                                    }
                                } else {
                                    //if(image_data[0].recipe_id!=req.params.id){
                                    logger.error("Recepie Image-Delete method: No Content for recipe ID " + req.params.id + " Error Status : 204");
                                    res.status(204).json({
                                        message: "No Content for this recipe ID"
                                    })
                                    //}

                                }
                            })
                            .catch(err => {
                                res.status(406).json({
                                        message: err.message,
                                        //message: "No recipe ID found"
                                    }),
                                    logger.error("Recepie Image-Delete method: Error : " + err.message + " Error Status : 406 ")
                            });
                            var DBtimer = new Date();

                            sdc.timing('DBimageDelete.timer',DBtimer);// Calculates time diff
                    


                    } else {
                        logger.error("Recepie Image-Delete method: Unauthorized Access Denied. Error Status : 401");
                        res.status(401).json({
                            message: 'Unauthorized Access Denied'
                        });
                    }
                })
            } else {
                logger.error("Recepie Image-Delete method: Email doesn't exist. Error Status : 404");
                res.status(404).json({
                    "message": "Email doesn't exist"
                }); // return wrong email
            }
        })
        .catch(

        );

        sdc.timing('imageDelete.timer',timer);
});

var image_s3_url = "HIIIII";

function uploadToS3(file) {
    let s3bucket = new AWS.S3({
        accessKeyId: IAM_USER_KEY,
        secretAccessKey: IAM_USER_SECRET,
        Bucket: BUCKET_NAME
    });
    s3bucket.createBucket(function () {
        var params = {
            Bucket: BUCKET_NAME,
            Key: file.name,
            Body: file.data
        };
        s3bucket.upload(params, function (err, data) {
            if (err) {
                console.log('error in callback');
                console.log(err);
            }
            console.log('success' + '--------------->>>>>');
            console.log(data);
            image_s3_url = data.Location;
            console.log(image_s3_url + '--------------------------->>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<')
        });
    });
}


var count = 0;

////POST
router.post('/recipie/:id/image', (req, res) => {
    sdc.increment('imagePost.counter');
    sdc.gauge('some.gauge', 10); // Set gauge to 10
    var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
    sdc.histogram('some.histogram', 10, {
      foo: 'bar'
    })
    // check for basic auth header
    if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
        logger.error("Recepie Image-Post method: Missing Authorization Header Error Status : 401");
        return res.status(401).json({
            message: 'Missing Authorization Header'
        });
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
                logger.error("Recepie Image-Post method: Email doesn't exist. Error Status : 400");
                return res.status(400).json({
                    "message": "Email doesn't exist"
                }); // return wrong email
            }
            let user_authorized = false;
            const author_id = data[0].id;
            if (data[0] != undefined) {
                const db_password = data[0].password;
                bcrypt.compare(password, db_password, (err, result) => {

                    //result= true;
                    if (err) {
                        logger.error("Recepie Image-Post method: Bad Request Error Status : 400  Error : " + err);
                        res.status(400).json({
                            message: 'Bad Request'
                        });
                    } else if (result) {

                        db.recipe.findAll({
                                where: {
                                    id: req.params.id,
                                    author_id: author_id

                                }
                            })
                            .then(data => {
                                console.log(data);
                                if (data.length <= 0) {
                                    logger.error("Recepie Image-Post method: Unauthorized user for given recipe id Error Status : 401");
                                    return res.status(401).json({
                                        "message": "Unauthorized user for given recipe id"
                                    }); // return wrong email
                                }
                            });


                        if (req.files.element2 == undefined) {
                            res.header("Content-Type", 'application/json');
                            logger.error("Recepie Image-Post method: Please upload an image in form data Error Status : 400");
                            res.status(400).send(JSON.stringify({
                                "Message": "Please upload an image in form data"
                            }))
                        } else {


                            const file2 = req.files.element2;
                            console.log(file2.name + "--=-=-=-=-=-=-=-=-=-=-=-");

                            var words = file2.name.split('.');
                            console.log(words[1] + "--=-=-=-=-=-=-=-=-=-=-=-");
                            if (words[1] != 'jpg' && words[1] != 'jpeg' && words[1] != 'png') {
                                res.header("Content-Type", 'application/json');
                                logger.error("Recepie Image-Post method: File type should be image Error Status : 406");
                                res.status(406).send(JSON.stringify({
                                    "Message": "File type should be image"
                                }))
                            } else {
                                var DBtimer = new Date();
                                db.image.findAll({
                                        where: {
                                            recipe_id: req.params.id
                                        }
                                    })
                                    .then(data => {
                                        if (data[0] == undefined) {


                                            var busboy = new Busboy({
                                                headers: req.headers
                                            });
                                            console.log("here");
                                            // The file upload has completed
                                            busboy.on('finish', function () {
                                                console.log('Upload finished');
                                                const file = req.files.element2;
                                                console.log(file);
                                                logger.info("Recepie Image-Post method: File upload finished");
                                                // Begins the upload to the AWS S3
                                                //uploadToS3(file);
                                                //setTimeout(function2, 5000000);

                                                logger.info("Recepie Image-Post method: File upload to S3-bucket in progress");
                                                let s3bucket = new AWS.S3({
                                                    // accessKeyId: IAM_USER_KEY,
                                                    // secretAccessKey: IAM_USER_SECRET,
                                                    // Bucket: BUCKET_NAME
                                                });
                                                var S3Timer = new Date();
                                                s3bucket.createBucket(function () {
                                                    var params = {
                                                        Bucket: BUCKET_NAME,
                                                        Key: new Date() + file.name, //file.name,
                                                        Body: file.data
                                                    };
                                                    count++;
                                                    s3bucket.upload(params, function (err, data) {
                                                        if (err) {
                                                            console.log('error in callback');
                                                            console.log(err);
                                                        }
                                                        console.log('success' + '--------------->>>>>');
                                                        //console.log(data);
                                                        image_s3_url = data.Location;
                                                        var r = '';
                                                        console.log(image_s3_url + '--------------------------->>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<')
                                                        s3bucket.getObject({
                                                            Bucket: BUCKET_NAME,
                                                            Key: data.key
                                                        }).on('success', function (response) {
                                                            console.log("Key was", response.request.params.Key);
                                                            console.log(response.httpResponse.headers);
                                                            logger.info("Recepie Image-Post method: File upload to S3-bucket Completed Successfully");
                                                            db.image.create({
                                                                    "recipe_id": req.params.id,
                                                                    "url": image_s3_url,
                                                                    "S3Key": data.Key,
                                                                    "recipeId": req.params.id,
                                                                    "metadata": response.httpResponse.headers
                                                                })
                                                                .then(imageData => {
                                                                    res.header("Content-Type", 'application/json');
                                                                    res.status(201).send(JSON.stringify({
                                                                        "id": imageData.image_id,
                                                                        "url": imageData.url
                                                                    }))
                                                                })
                                                        }).send();

                                                        // db.image.create({
                                                        //         "recipe_id": req.params.id,
                                                        //         "url": image_s3_url,
                                                        //         "S3Key": data.Key,
                                                        //         "recipeId": req.params.id
                                                        //     })
                                                        //     .then(imageData => {
                                                        //         res.header("Content-Type", 'application/json');
                                                        //         res.status(201).send(JSON.stringify({
                                                        //             "id": imageData.image_id,
                                                        //             "url": imageData.url
                                                        //         }))
                                                        //     })
                                                        res.status(201);
                                                    });
                                                });
                                                sdc.timing('imagePost.timer',S3Timer); // Calculates time diff
                                            });

                                            req.pipe(busboy);
                                            sdc.timing('DBimagePost.timer',DBtimer);

                                            console.log(image_s3_url + "==================")
                                            // db.image.create({
                                            //         "recipe_id": req.params.id,
                                            //         "url":image_s3_url,
                                            //         "recipeId": req.params.id
                                            //     })
                                            //     .then(imageData => {
                                            //         res.header("Content-Type", 'application/json');
                                            //         res.status(201).send(JSON.stringify({
                                            //             "id": imageData.image_id,
                                            //             "url": imageData.url
                                            //         }))
                                            //     })
                                            // res.status(201);

                                        } else {
                                            res.header("Content-Type", 'application/json');
                                            logger.error("Recepie Image-Post method: Delete the Image first before posting a new image. Error code : 400");
                                            res.status(400).send(JSON.stringify({
                                                "Result": "Delete the Image first before posting a new image."
                                            }));
                                        }
                                    })
                                    .catch(err => {
                                        res.status(406).json({
                                                message: err.message
                                            }),
                                            logger.error("Recepie Image-Post method: Error code : 406 Error : " + err.message)
                                    })
                                    

                            }
                        }
                    } else {
                        logger.error("Recepie Image-Post method: Unauthorized Access Denied. Error code : 401 ");
                        res.status(401).json({
                            message: 'Unauthorized Access Denied'
                        });
                    }
                })
            } else {
                logger.error("Recepie Image-Post method: EmailId " + email + " doesn't exist. Error code : 400 ");
                res.status(400).json({
                    "message": "Email doesn't exist"
                }); // return wrong email
            }
        })
        .catch();

        sdc.timing('imagePost.timer',timer);

})



//// Get IMAGE by recipe id and image id 

router.get('/recipie/:id/image/:imageId', (req, res) => {
    sdc.increment('recipeImage.counter');
    sdc.gauge('some.gauge', 10); // Set gauge to 10
    var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
    sdc.histogram('some.histogram', 10, {
      foo: 'bar'
    })


    var DBtimer = new Date();
    db.image.findAll({
            where: {
                recipe_id: req.params.id
            }
        })
        .then(image_data => {
            if (image_data.length > 0) {

                if (image_data[0].image_id != req.params.imageId) {
                    logger.error("Recepie Image-get method: No Image Id Found. Error code : 404 ");
                    res.status(404).json({
                        message: "No Image Id Found"
                    })
                } else {
                    res.header("Content-Type", 'application/json');
                    logger.info("Recepie Image-get method: Got image with Image Id " + image_data[0].image_id + ". Status code : 200 ");
                    res.status(200).send(JSON.stringify({
                        "id": image_data[0].image_id,
                        "url": image_data[0].url
                    }));

                }
            } else {
                //if(image_data[0].recipe_id!=req.params.id){
                logger.error("Recepie Image-get method: No Recipe ID found. Error Status code : 404 ");
                res.status(404).json({
                    message: "No Recipe ID found"
                })
                //}

            }
        })
        .catch(err => {
            res.status(406).json({
                    message: err.message,
                }),
                logger.error("Recepie Image-get method: Error code : 406. Error : " + err.message)
        });
        sdc.timing('DBrecipeImage.timer',DBtimer);// Calculates time diff

        sdc.timing('recipeImage.timer',timer);


});

//// Get by latest recipe ID

router.get('/recipies', (req, res) => {
    //db.recipe.max('created_date')
    //db.recipe.query(,{type:})
    sdc.increment('recipeGet.counter');
    sdc.gauge('some.gauge', 10); // Set gauge to 10
    var timer = new Date();
  //  sdc.timing('userPostDBTimer',timer); // Calculates time diff
    sdc.histogram('some.histogram', 10, {
      foo: 'bar'
    })
    db.recipe.findAll({
            limit: 10,
            order: [
                ['created_date', 'DESC']
            ]
        })
        .then(data => {
            if (data.length < 1) {
                logger.error("Recepie get-latest method: No data present. Error code : 404");
                return res.status(404).json({
                    message: 'No data present'
                });

            } else {
                //console.log(data.length);
                // res.status(200).send(JSON.stringify(
                //     {
                //         "message":data[0]
                //     }
                // ))
                const recipeID = data[0].id;

                var DBtimer = new Date();
                db.nutInfo.findAll({
                        where: {
                            recipe_id: recipeID
                        }
                    })
                    .then(nutrition_information => {
                        db.image.findAll({

                                where: {
                                    recipe_id: recipeID
                                }
                            })
                            .then(imageInformation => {
                                if (imageInformation.length > 0) {
                                    res.header("Content-Type", 'application/json');
                                    logger.info("Recepie get-latest method: Getting the latest Recipe with image Successfully Status code : 200");
                                    res.status(200).send(JSON.stringify(

                                        {
                                            "image": {
                                                "id": imageInformation[0].image_id,
                                                "url": imageInformation[0].url
                                            },
                                            "id": data[0].id,
                                            "created_ts": data[0].created_date,
                                            "updated_ts": data[0].updated_date,
                                            "author_id": data[0].author_id,
                                            "cook_time_in_min": data[0].cook_time_in_min,
                                            "prep_time_in_min": data[0].prep_time_in_min,
                                            "total_time_in_min": data[0].total_time_in_min,
                                            "title": data[0].title,
                                            "cusine": data[0].cusine,
                                            "servings": data[0].servings,
                                            "ingredients": data[0].ingredients,
                                            "steps": data[0].steps,
                                            "nutrition_information": {
                                                "calories": nutrition_information[0].calories,
                                                "cholesterol_in_mg": nutrition_information[0].cholesterol_in_mg,
                                                "sodium_in_mg": nutrition_information[0].sodium_in_mg,
                                                "carbohydrates_in_grams": nutrition_information[0].carbohydrates_in_grams,
                                                "protein_in_grams": nutrition_information[0].protein_in_grams
                                            }
                                        }
                                    ));
                                } else {
                                    res.header("Content-Type", 'application/json');
                                    logger.info("Recepie get-latest method: Getting the latest Recipe Successfully Status code : 200");
                                    res.status(200).send(JSON.stringify(

                                        {
                                            "image": "NO IMAGE PRESENT",
                                            "id": data[0].id,
                                            "created_ts": data[0].created_date,
                                            "updated_ts": data[0].updated_date,
                                            "author_id": data[0].author_id,
                                            "cook_time_in_min": data[0].cook_time_in_min,
                                            "prep_time_in_min": data[0].prep_time_in_min,
                                            "total_time_in_min": data[0].total_time_in_min,
                                            "title": data[0].title,
                                            "cusine": data[0].cusine,
                                            "servings": data[0].servings,
                                            "ingredients": data[0].ingredients,
                                            "steps": data[0].steps,
                                            "nutrition_information": {
                                                "calories": nutrition_information[0].calories,
                                                "cholesterol_in_mg": nutrition_information[0].cholesterol_in_mg,
                                                "sodium_in_mg": nutrition_information[0].sodium_in_mg,
                                                "carbohydrates_in_grams": nutrition_information[0].carbohydrates_in_grams,
                                                "protein_in_grams": nutrition_information[0].protein_in_grams
                                            }
                                        }
                                    ));
                                }

                            })
                    });
                    
                sdc.timing('DBrecipeGet.timer',DBtimer);// Calculates time diff
            }
        })
        .catch(err => {
            res.status(406).json({
                    message: err.message
                }),
                logger.error("Recepie get-latest method: Error code : 406. Error : " + err.message)
        });

        sdc.timing('recipeGet.timer',timer);
});