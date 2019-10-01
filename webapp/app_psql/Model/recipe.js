
'use strict'

module.exports = (sequelize, DataTypes) => {

const recipe = sequelize.define('recipes', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false
  },
  author_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cook_time_in_min: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate :{
      isMul5: function(value) {
        if(parseInt(value) % 5 != 0) {
          throw new Error('Only muliple of 5 values are allowed in cook_time_in_min!')
        }
      }
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  prep_time_in_min: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate :{
      isMul5: function(value) {
        if(parseInt(value) % 5 != 0) {
          throw new Error('Only muliple of 5 values are allowed in prep_time_in_min!')
        }
      }
    }
  },
  total_time_in_min :{
    type: DataTypes.INTEGER,
    allowNull: false
  },
  cusine:{
    type: DataTypes.STRING,
    allowNull: false
  },
  servings :{
    type: DataTypes.INTEGER,
    allowNull: false
  },  
  ingredients :{
    type : DataTypes.ARRAY(DataTypes.STRING),
    allowNull: false
   // unique : true
  } ,
  steps :{
    type : DataTypes.JSON(DataTypes.STRING),
    allowNull: false
    //unique : true
  }
},  
  {
    underscored: true
  });

return recipe;
};