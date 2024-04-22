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
