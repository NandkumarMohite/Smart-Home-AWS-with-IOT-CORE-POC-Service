const AWS = require('aws-sdk');
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

module.exports.registerUser = async (event) => {
    const { username, email, address, gender, given_name, password } = JSON.parse(event.body);

    if (!username || !password || !email) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Username, password, and email are required.' })
        };
    }
    try {
        // Define parameters for user sign-up
        const signUpParams = {
            ClientId: '6b3lajqibgc496m0f9f4qgs8oc', // Specify your Cognito User Pool Client ID
            Username: username,
            Password: password,
            UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'address', Value: address },
                { Name: 'gender', Value: gender },
                { Name: 'given_name', Value: given_name },

            ]
        };

        const data = await cognitoIdentityServiceProvider.signUp(signUpParams).promise();
        await invokeStepFunction(data.UserSub);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'User registered successfully.', data })
        };
    } catch (error) {
        console.error('Error registering user:', error);

        let errorMessage = 'An error occurred while registering user.';

        if (error.code === 'UsernameExistsException') {
            errorMessage = 'Username already exists. Please choose a different username.';
        } else if (error.code === 'InvalidParameterException') {
            errorMessage = 'Invalid parameter provided. Please check your input.';
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ message: errorMessage })
        };
    }
};

async function invokeStepFunction(UserSub) {
    const userId = UserSub; // You need to pass the userId from Cognito

    const iot = new AWS.Iot();

    try {
        // Create thing group for the user's home
        const params = {
            thingGroupName: `Home_${userId}`,
            thingGroupProperties: {
                thingGroupDescription: `Thing group for user ${userId}'s home`
            }
        };
        await iot.createThingGroup(params).promise();
        console.log("Thing group for user's home created successfully:", params);

        // Create thing for light bulb
        const lightBulbParams = {
            thingName: `LightBulb_${userId}`
        };
        const lightBulbData = await iot.createThing(lightBulbParams).promise();
        console.log("Light bulb thing created successfully:", lightBulbData);

        // Add the light bulb thing to the home thing group
        const lightBulbGroupParams = {
            thingGroupName: `Home_${userId}`,
            thingName: lightBulbParams.thingName
        };
        await iot.addThingToThingGroup(lightBulbGroupParams).promise();
        console.log("Light bulb thing added to home group successfully:", lightBulbGroupParams);

        // Create thing for motion sensor
        const motionSensorParams = {
            thingName: `MotionSensor_${userId}`
        };
        const motionSensorData = await iot.createThing(motionSensorParams).promise();
        console.log("Motion sensor thing created successfully:", motionSensorData);

        // Add the motion sensor thing to the home thing group
        const motionSensorGroupParams = {
            thingGroupName: `Home_${userId}`,
            thingName: motionSensorParams.thingName
        };
        await iot.addThingToThingGroup(motionSensorGroupParams).promise();
        console.log("Motion sensor thing added to home group successfully:", motionSensorGroupParams);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Things and group created successfully' })
        };
    } catch (error) {
        console.error("Error creating things and group:", error);

        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error creating things and group', error: error })
        };
    }

}    


// module.exports.createThingGroup = async (event) => {
//     const userId = event.userId; // You need to pass the userId from Cognito
  
//     const iot = new AWS.Iot();
  
//     try {
//       // Create thing group for the user's home
//       const params = {
//         thingGroupName: `Home_${userId}`,
//         thingGroupProperties: {
//           thingGroupDescription: `Thing group for user ${userId}'s home`
//         }
//       };
//       await iot.createThingGroup(params).promise();
//       console.log("Thing group for user's home created successfully:", params);
  
//       // Create thing for light bulb
//       const lightBulbParams = {
//         thingName: `LightBulb_${userId}`
//       };
//       const lightBulbData = await iot.createThing(lightBulbParams).promise();
//       console.log("Light bulb thing created successfully:", lightBulbData);
  
//       // Add the light bulb thing to the home thing group
//       const lightBulbGroupParams = {
//         thingGroupName: `Home_${userId}`,
//         thingName: lightBulbParams.thingName
//       };
//       await iot.addThingToThingGroup(lightBulbGroupParams).promise();
//       console.log("Light bulb thing added to home group successfully:", lightBulbGroupParams);
  
//       // Create thing for motion sensor
//       const motionSensorParams = {
//         thingName: `MotionSensor_${userId}`
//       };
//       const motionSensorData = await iot.createThing(motionSensorParams).promise();
//       console.log("Motion sensor thing created successfully:", motionSensorData);
  
//       // Add the motion sensor thing to the home thing group
//       const motionSensorGroupParams = {
//         thingGroupName: `Home_${userId}`,
//         thingName: motionSensorParams.thingName
//       };
//       await iot.addThingToThingGroup(motionSensorGroupParams).promise();
//       console.log("Motion sensor thing added to home group successfully:", motionSensorGroupParams);
  
//       return {
//         statusCode: 200,
//         body: JSON.stringify({ message: 'Things and group created successfully' })
//       };
//     } catch (error) {
//       console.error("Error creating things and group:", error);
  
//       return {
//         statusCode: 500,
//         body: JSON.stringify({ message: 'Error creating things and group', error: error })
//       };
//     }
//   };