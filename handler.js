const AWS = require('aws-sdk');
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();
const fs = require('fs')
// const iot = new AWS.IotData({ endpoint: 'a2xdgnb8rzgu7v.iot.us-east-1.amazonaws.com' }); // Specify your AWS IoT endpoint
const s3 = new AWS.S3();
const s3BucketName = 'dataofca';
const caCertKey = 'MotionSensor.cert.pem';

let caCert;

async function loadCACertificate() {
    try {
        const params = {
            Bucket: s3BucketName,
            Key: caCertKey
        };

        const data = await s3.getObject(params).promise();
        caCert = data.Body.toString();
    } catch (err) {
        console.error('Error loading CA certificate from S3:', err);
        throw err;
    }
}

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
            thingName: `LightBulb`
        };
        try {
            // Attempt to create the thing
            const lightBulbData = await iot.createThing(lightBulbParams).promise();
            console.log('New light bulb created:', lightBulbData);
        } catch (err) {
            // If the thing already exists, handle the error
            if (err.code === 'ResourceAlreadyExistsException') {
                // Your logic here for handling the case where the thing already exists
                console.log('Light bulb already exists. Your logic here...');
            } else {
                // Handle other errors
                console.error('Error creating light bulb:', err);
            }
        }

        // Add the light bulb thing to the home thing group
        const lightBulbGroupParams = {
            thingGroupName: `Home_${userId}`,
            thingName: lightBulbParams.thingName
        };
        await iot.addThingToThingGroup(lightBulbGroupParams).promise();
        console.log("Light bulb thing added to home group successfully:", lightBulbGroupParams);

        // Create thing for motion sensor
        const motionSensorParams = {
            thingName: `MotionSensor`
        };

        try {
            // Attempt to create the thing
            const motionSensorData = await iot.createThing(motionSensorParams).promise();
            console.log("Motion sensor thing created successfully:", motionSensorData);
        } catch (err) {
            // If the thing already exists, handle the error
            if (err.code === 'ResourceAlreadyExistsException') {
                // Your logic here for handling the case where the thing already exists
                console.log('Sensor already exists. Your logic here...');
            } else {
                // Handle other errors
                console.error('Error creating motion sensor:', err);
            }
        }

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

module.exports.publishToIoT = async (event) => {
    if (!caCert) {
        await loadCACertificate();
    }
    try {
        const iot = new AWS.IotData({
            endpoint: 'a2xdgnb8rzgu7v.iot.us-east-1.amazonaws.com',
            httpOptions: {
                agent: new require('https').Agent({
                    ca: caCert
                })
            }
        });
        console.log('IoT Data:', iot);
        const { userId, value } = JSON.parse(event.body);
  
        // Construct thing group name and thing name
        const thingGroupName = `Home_${userId}`;
        const thingName = "MotionSensor"; // Assuming all things are motion sensors
    
        // Define sensor data and topic prefix
        const sensorData = "status";
        const topicPrefix = `home/groups/${thingGroupName}/things`;
        const params = {
            topic: `${topicPrefix}/${thingName}/${sensorData}`, // Specify the MQTT topic to publish to
            payload: JSON.stringify({ message: value }),
            qos: 0
        };

        await iot.publish(params).promise();

        return {
            statusCode: 200,
            body: JSON.stringify('Message published successfully')
        };
    } 
    catch (error) {
      // Handle errors
      console.error('Error publishing sensor data:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Error publishing sensor data' })
      };
    }
  };   