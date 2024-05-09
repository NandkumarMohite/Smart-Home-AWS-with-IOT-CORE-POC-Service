const AWS = require('aws-sdk');
const { httpError, httpResponse } = require('./responseUtil');
// const axios = require('axios');

const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();
const fs = require('fs')
const iot = new AWS.Iot();
const ses = new AWS.SES();
const paramsCertificate = {
    keyPath: "./certificates/private-key.pem.key",
    certPath: "./certificates/certificate.pem.crt",
    caPath: "./certificates/AmazonRootCA1.pem",
    clientId: "iotconsole-10a48a6b-1ddf-4233-bdc8-1cdf1ae84b9e",
    endpoint: "a2xdgnb8rzgu7v-ats.iot.us-east-1.amazonaws.com"
};
const device = new AWS.IotData(paramsCertificate);
const docClient = new AWS.DynamoDB.DocumentClient();
const cloudformation = new AWS.CloudFormation();
module.exports.registerUser = async (event) => {
    const { username, email, address, gender, given_name, password } = JSON.parse(event.body);

    if (!username || !password || !email) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Username, password, and email are required.' })
        };
    }
    try {

        const response = await listoutUsersPoolClienId();
        console.log("ClientId", response.UserPoolClients[0].ClientId);
        const signUpParams = {
            ClientId: response.UserPoolClients[0].ClientId, 
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
        let motionSensorArray = await addThingGroupForUser(data.UserSub);
        await verifyEmailAddress(email);
        await registerUserInDynamo(data.UserSub,{ username, email, address, gender, given_name, password }, motionSensorArray);
        return httpResponse(200, {data: data} )
    } catch (error) {
        console.error('Error registering user:', error);

        let errorMessage = 'An error occurred while registering user.';

        if (error.code === 'UsernameExistsException') {
            errorMessage = 'Username already exists. Please choose a different username.';
        } else if (error.code === 'InvalidParameterException') {
            errorMessage = 'Invalid parameter provided. Please check your input.';
        }
        return httpError(500, {message:errorMessage})
    }
};

async function verifyEmailAddress(email) {
    try {
        const params = {
            EmailAddress: email
        };
        await ses.verifyEmailIdentity(params).promise();
    } catch (error) {
        console.error('Error verifying email address:', error);
        throw new Error('Failed to verify email address.');
    }
}

async function addThingGroupForUser(UserSub) {
    const userId = UserSub;
    try {
        const params = {
            thingGroupName: `Home_${userId}`,
            thingGroupProperties: {
                thingGroupDescription: `Thing group for user ${userId}'s home`
            }
        };
        await iot.createThingGroup(params).promise();
        console.log("Thing group for user's home created successfully:", params);

        const lightBulbParams = {
            thingName: `LightBulb_${userId}`
        };
        try {
            const lightBulbData = await iot.createThing(lightBulbParams).promise();
            console.log('New light bulb created:', lightBulbData);
        } catch (err) {
            if (err.code === 'ResourceAlreadyExistsException') {
                console.log('Light bulb already exists. Your logic here...');
            } else {
                console.error('Error creating light bulb:', err);
            }
        }
        const lightBulbGroupParams = {
            thingGroupName: `Home_${userId}`,
            thingName: lightBulbParams.thingName
        };
        await iot.addThingToThingGroup(lightBulbGroupParams).promise();
        console.log("Light bulb thing added to home group successfully:", lightBulbGroupParams);
        const motionSensorParams = {
            thingName: `MotionSensor_${userId}`
        };

        try {
            const motionSensorData = await iot.createThing(motionSensorParams).promise();
            console.log("Motion sensor thing created successfully:", motionSensorData);
        } catch (err) {
            if (err.code === 'ResourceAlreadyExistsException') {
                console.log('Sensor already exists. Your logic here...');
            } else {
                console.error('Error creating motion sensor:', err);
            }
        }

        const motionSensorGroupParams = {
            thingGroupName: `Home_${userId}`,
            thingName: motionSensorParams.thingName
        };
        await iot.addThingToThingGroup(motionSensorGroupParams).promise();
        console.log("Motion sensor thing added to home group successfully:", motionSensorGroupParams);
        return [lightBulbGroupParams,motionSensorGroupParams];
    } catch (error) {
        console.error("Error creating things and group:", error);
        return httpError(500,{ message: 'Error creating things and group', error: error });
    }

}

async function registerUserInDynamo(userid,data,motionSensorArray) {
    const dynamoParams = {
        TableName: 'UserHomeThingGroupData',
        Item: {
            userId: userid,
            MotionSensor: "Motion_not_detected",
            LightBulb: "OFF",
            email: data.email,
            isUserOnHoliday:  false,
        }
    };

    const dynamoParamsForThing = {
        TableName: 'UserAndThingData',
        Item: {
            userid: userid,
            motionSensor: motionSensorArray[1].thingName,
            lightBulb: motionSensorArray[0].thingName
        }
    }
    await docClient.put(dynamoParams).promise();
    await docClient.put(dynamoParamsForThing).promise();

}

module.exports.publishSensorSignalToMQQT = async (event) => {
    const body = JSON.parse(event.body);
    const { userId, message } = body;
    const thingGroupName = `Home_${userId}`;
    const thingName = `MotionSensor_${userId}`; 
    const sensorData = "statusOfMotion";
    const topicPrefix = `home/groups/${thingGroupName}/things`;

    const topic = `${topicPrefix}/${thingName}/${sensorData}`;
    console.log("topic", topic);
    const params = {
        topic: topic,
        payload: JSON.stringify({ message: `${message}+${userId}` }),
        qos: 0
    };
    console.log("params", params);
    console.log("device", device);
    try {
        await device.publish(params).promise();
        const scanedData = await getUserDataFromDynamo(userId);
        console.log("scanedData", scanedData);
        await putDataIntoDynamoDb(scanedData,message);
        return httpResponse(200, { message: 'Message published successfully to motion Sensor' })
    } catch (err) {
        console.error('Error publishing message:', err);
        return httpError(500, { message: 'Error publishing message' })

    }
};

module.exports.subscribeTheMotionSensorFromMQQT = async (event) => {
    try {
        console.log("event", event);
        if (event == undefined || event == null || event == {}) {
            console.error('No records found in the event');
            return {
                statusCode: 400,
                body: JSON.stringify('No records found in the event')
            };
        }
        const data = event.message;
        console.log("DATA", data);
        const myMessageAndUseID = data.split("+")
        if (myMessageAndUseID[0] == "motion_detected") {
            const scanedData = await getUserDataFromDynamo(myMessageAndUseID[1]);
            (scanedData.Item?.isUserOnHoliday == true) 
            ? await holidayChackMethod(scanedData.Item?.email,myMessageAndUseID[1]) 
            : await publishLightBulbSignalToMQQT('LightBulb_ON', myMessageAndUseID[1]);
        } else{
            await publishLightBulbSignalToMQQT('LightBulb_OFF', myMessageAndUseID[1]);
        }

        console.log("publishToLightBulb successfull");
        return {

            statusCode: 200,
            body: JSON.stringify('Motion processed successfully')
        };
    } catch (error) {
        console.error('Error processing motion:', error);
        return {
            statusCode: 500,
            body: JSON.stringify('Error processing motion')
        };
    }
};
async function holidayChackMethod(email,userId) {
try{
    const dynamoParams = {
        TableName: 'UserHomeThingGroupData',
        Item: {
            userId: userId,
            MotionSensor: "Motion_Detected_when_you_are_on_Holiday",
            LightBulb: "OFF",
            email: email,
            isUserOnHoliday: true
        }
    };

    await docClient.put(dynamoParams).promise();
    await sendEmail(email, "Hi Sir, You are on Holiday and some motion is detected in home Thank you sir!", "Motion Detected when you are on Holiday");

} catch (err) {
    console.error('Error publishing data in DB:', err);
    return {
        body: JSON.stringify({ message: 'Error publishing data in DB' })
    };
}

}
async function publishLightBulbSignalToMQQT(message, userId) {
    const thingGroupName = `Home_${userId}`;
    const thingName = `LightBulb_${userId}`; 
    const sensorData = "statusOfLight";
    const topicPrefix = `home/groups/${thingGroupName}/things`;

    const topic = `${topicPrefix}/${thingName}/${sensorData}`;
    console.log("topic", topic);
    const params = {
        topic: topic, 
        payload: JSON.stringify({ message, userId }),
        qos: 1 
    };
    try {
        await device.publish(params).promise();
        console.log('Message published successfully to motion Light Bulb');
        const scanedData = await getUserDataFromDynamo(userId);
        const dynamoParams = {
            TableName: 'UserHomeThingGroupData',
            Item: {
                userId: userId,
                MotionSensor: (scanedData.Item?.MotionSensor == "motion_detected") ?  "motion_detected" : "motion_not_detected",
                email: scanedData.Item?.email,
                LightBulb: (message == "LightBulb_ON") ? "ON": "OFF",
                isUserOnHoliday: scanedData.Item?.isUserOnHoliday
            }
        };

        await docClient.put(dynamoParams).promise();

    } catch (err) {
        console.error('Error publishing message:', err);
        return {
            body: JSON.stringify({ message: 'Error publishing message' })
        };
    }
}

module.exports.subscribeTheLightBulbFromMQQT = async (event) => {
    try {
        console.log("event", event);
        if (!event || !event.message || !event.userId) {
            console.error('Invalid event data');
            return {
                statusCode: 400,
                body: JSON.stringify('Invalid event data')
            };
        }
        
        const { message, userId } = event;
        if (message === "LightBulb_ON") {
            const email = await getUserEmail(userId);
            if (!email) {
                console.error('User email not found');
                return {
                    statusCode: 404,
                    body: JSON.stringify('User email not found')
                };
            }
            
            await sendEmail(email, "The light bulb is now ON.", "Light Bulb Status Notification");
        }

        console.log("SubscriptionToLightBulb successful");
        return {
            statusCode: 200,
            body: JSON.stringify('Motion processed successfully')
        };
    } catch (error) {
        console.error('Error processing motion:', error);
        return {
            statusCode: 500,
            body: JSON.stringify('Error processing motion')
        };
    } 
}

async function getUserEmail(userId) {
    try {
        const params = {
            UserPoolId: 'us-east-1_wUy7rlOCn',
            Username: userId
        };
        const user = await cognitoIdentityServiceProvider.adminGetUser(params).promise();
        const email = user.UserAttributes.find(attr => attr.Name === 'email');
        return email ? email.Value : null;
    } catch (error) {
        console.error('Error fetching user email:', error);
        throw error;
    }
}

async function sendEmail(email, data, subjectData) {
    try {
        const params = {
            Destination: {
                ToAddresses: [email]
            },
            Message: {
                Body: {
                    Text: {
                        Data: data
                    }
                },
                Subject: {
                    Data: subjectData
                }
            },
            Source: 'rajpajob@gmail.com'
        };
        await ses.sendEmail(params).promise();
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}

module.exports.loginUsingCognito = async (event) => {
    const { username, password } = JSON.parse(event.body);
    const response = await listoutUsersPoolClienId();
    console.log("ClientId", response.UserPoolClients[0].ClientId);
    try {
        const params = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: response.UserPoolClients[0].ClientId,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
            },
        };
        const adminPram = {
            UserPoolId: 'us-east-1_wUy7rlOCn',
            Username: username
        };

        const data = await cognitoIdentityServiceProvider.initiateAuth(params).promise();

        const dataUserID = await cognitoIdentityServiceProvider.adminGetUser(adminPram).promise();
        userId = dataUserID.UserAttributes.find(attr => attr.Name === 'sub').Value;

        return httpResponse(200, { data: {userMainData: data, userId: userId}});
    } catch (err) {
        return httpError(401,{message: err.message })
    }
};

module.exports.goingForHoliday = async (event) => {
    const { userId } = JSON.parse(event.body);
    const queryParams = {
        TableName: 'UserHomeThingGroupData',
        Key: {
            'userId': userId,
        },
    };
    const scanedData = await docClient.get(queryParams).promise();
    const dynamoParams = {
        TableName: 'UserHomeThingGroupData',
        Item: {
            userId: userId,
            MotionSensor: (scanedData.Item?.MotionSensor == "ON") ? "ON": "OFF",
            LightBulb: (scanedData.Item?.LightBulb == "ON") ? "ON": "OFF",
            email: scanedData.Item?.email,
            isUserOnHoliday: (scanedData.Item?.isUserOnHoliday == true )? false : true
        }
    };

    await docClient.put(dynamoParams).promise();
    return httpResponse(200, { message: (scanedData.Item?.isUserOnHoliday == true )? "Status Updated as you are coming back from Holiday" : "Status Updated as you are going on Holiday"});
};

async function listoutUsersPoolClienId() {
    const CognitoParams = {
        UserPoolId: 'us-east-1_wUy7rlOCn' // Replace with your actual user pool ID
    };
    const response = await cognitoIdentityServiceProvider.listUserPoolClients(CognitoParams).promise();
    console.log("ClientId", response.UserPoolClients[0].ClientId);
    return response;
}

async function getUserDataFromDynamo(userId) {
    const queryParams = {
        TableName: 'UserHomeThingGroupData',
        Key: {
            'userId': userId,
        },
    };
    const scanedData = await docClient.get(queryParams).promise();
    return scanedData;
}

async function putDataIntoDynamoDb(scanedData,message) {
    const dynamoParams = {
        TableName: 'UserHomeThingGroupData',
        Item: {
            userId: scanedData.Item?.userId,
            MotionSensor: message,
            LightBulb: (scanedData.Item?.LightBulb == "ON") ?  "ON" : "OFF",
            email: scanedData.Item?.email,
            isUserOnHoliday: (scanedData.Item?.isUserOnHoliday == true) ? true : false
        }
    };
    await docClient.put(dynamoParams).promise();
}
