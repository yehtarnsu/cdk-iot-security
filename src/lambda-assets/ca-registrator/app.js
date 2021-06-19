const { Request, Response } = require('softchef-utility');
const { UnknownVerifierError } = require('./errors');
const AWS = require('aws-sdk');
const { CertificateGenerator } = require('./certificate-generator');

/**
 * event example
 *
 * event = {
 *  "csrSubjects": {
 *    "commonName": "", // It would be replaced by the registration code, thus is unnecessary.
 *    "countryName": "TW",
 *    "stateName": "TP",
 *    "localityName": "TW",
 *    "organizationName": "Soft Chef",
 *    "organizationUnitName": "web"
 *  },
 *  "verifierName": "verifier_name"
 *  }
 * }
 */

/**
 * The lambda function handler for register CA.
 * @param {Object} event The HTTP request from the API gateway.
 * @returns The HTTP response containing the registration result.
 */
exports.handler = async (event) => {
  const request = new Request(event);
  const response = new Response();

  let csrSubjects = request.input('csrSubjects', {});  
  const verifierName = request.input('verifierName');

  const region = process.env.AWS_REGION;
  const iot = new AWS.Iot({ region: region });
  const s3 = new AWS.S3({ region: region });

  const bucketName = process.env.BUCKET_NAME;
  const bucketPrefix = process.env.BUCKET_PREFIX;
  const queueUrl = process.env.DEIVCE_ACTIVATOR_QUEUE_URL;
  const deviceActivatorRoleArn = process.env.DEIVCE_ACTIVATOR_ROLE_ARN;

  let certificates = {
    ca: {
      keys: {
        publicKey: null,
        privateKey: null,
      },
      certificate: null,
    },
    verification: {
      keys: {
        publicKey: null,
        privateKey: null,
      },
      certificate: null,
    },
  };

  try {
    if (verifierName && !process.env[verifierName]) {
      throw new UnknownVerifierError();
    }
    const verifierArn = process.env[verifierName] || "";
    const { registrationCode } = await iot.getRegistrationCode({}).promise();
    csrSubjects = Object.assign(csrSubjects, { commonName: registrationCode });
    certificates = CertificateGenerator.getCaRegistrationCertificates(csrSubjects);
    const { certificateId, certificateArn } = await iot.registerCACertificate({
      caCertificate: certificates.ca.certificate,
      verificationCertificate: certificates.verification.certificate,
      allowAutoRegistration: true,
      registrationConfig: {},
      setAsActive: true,
      // tags: [{ Key: 'ca', Value: '01' }],
    }).promise();

    await iot.createTopicRule({
      ruleName: `ActivationRule_${certificateId}`,
      topicRulePayload: {
        actions: [
          {
            sqs: {
              queueUrl: queueUrl,
              roleArn: deviceActivatorRoleArn,
            },
          },
        ],
        sql: `SELECT *, "${verifierArn}" as verifierArn FROM '$aws/events/certificates/registered/${certificateId}'`,
      },
    }).promise();

    await s3.upload({
      Bucket: bucketName,
      Key: `${bucketPrefix}/${certificateId}/ca-certificate.json`,
      Body: Buffer.from(JSON.stringify(Object.assign({}, certificates, {
        certificateId: certificateId,
        certificateArn: certificateArn
      }))),
    }).promise();

    return response.json(certificateId);
  } catch (error) {
    console.log(error);
    return response.error(error, error.code);
  }
};