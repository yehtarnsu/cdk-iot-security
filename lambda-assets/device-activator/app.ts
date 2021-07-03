import {
  DescribeCertificateCommand,
  DescribeCACertificateCommand,
  UpdateCertificateCommand,
  IoTClient,
  CreateThingCommand,
  CreatePolicyCommand,
  AttachPolicyCommand,
  AttachThingPrincipalCommand,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-iot';
import {
  InvokeCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda';
import { Response } from '@softchef/lambda-events';
import {
  VerificationError,
  InformationNotFoundError,
} from './errors';
import {
  CaCertificateDescriptionSchema,
  DeviceCertificateDescriptionSchema,
  TagListSchema,
  VerificationSchema,
} from './schemas';

/**
 * The lambda function handler activating the client certificates.
 * @param event The lambda function event, which is a bunch of SQS message.
 * @returns The HTTP response containing the activation results.
 */
export const handler = async (event: any = {}) : Promise <any> => {
  let response: Response = new Response();
  let [record] = event.Records;

  const { certificateId: deviceCertificateId } = JSON.parse(record.body);
  const {
    caCertificateId,
    deviceCertificateArn,
    deviceCertificateDescription,
  } = await getDeviceCertificateInformation(deviceCertificateId);
  const verifierName = await getVerifierName(caCertificateId);
  if (verifierName) {
    await verify(verifierName, deviceCertificateDescription);
  }
  await provision(deviceCertificateId, deviceCertificateArn);
  const message: any = response.json({
    certificateId: deviceCertificateId,
    verifierName: verifierName,
  });
  return message;
};

async function getDeviceCertificateInformation(deviceCertificateId: string) {
  const { certificateDescription: deviceCertificateDescription = {} } = await new IoTClient({}).send(
    new DescribeCertificateCommand({
      certificateId: deviceCertificateId,
    }),
  );
  const { caCertificateId, certificateArn: deviceCertificateArn } = await DeviceCertificateDescriptionSchema
    .validateAsync(deviceCertificateDescription).catch((error: Error) => {
      throw new InformationNotFoundError(error.message);
    });
  return { caCertificateId, deviceCertificateArn, deviceCertificateDescription };
}

async function getVerifierName(caCertificateId: string) {
  const { certificateDescription: caCertificateDescription = {} } = await new IoTClient({}).send(
    new DescribeCACertificateCommand({ certificateId: caCertificateId }),
  );

  const { certificateArn: caCertificateArn } = await CaCertificateDescriptionSchema
    .validateAsync(caCertificateDescription).catch((error: Error) => {
      throw new InformationNotFoundError(error.message);
    });

  let { tags } = await new IoTClient({}).send(new ListTagsForResourceCommand({ resourceArn: caCertificateArn }));
  tags = await TagListSchema.validateAsync(tags).catch((error: Error) => {
    throw new InformationNotFoundError(error.message);
  });
  const { Value: verifierName } = tags!.find(tag => tag.Key === 'verifierName') || { Value: '' };
  return verifierName;
}

async function verify(verifierName: string, deviceCertificateDescription: any) {
  let {
    Payload: payload = new Uint8Array(
      Buffer.from(JSON.stringify({ verified: false })),
    ),
  } = await new LambdaClient({}).send(
    new InvokeCommand({
      FunctionName: decodeURIComponent(verifierName),
      Payload: Buffer.from(
        JSON.stringify(deviceCertificateDescription),
      ),
    }),
  );

  const { body } = JSON.parse(
    String.fromCharCode.apply(null, [...payload]),
  );

  await VerificationSchema.validateAsync(body).catch((error: Error) => {
    throw new VerificationError(error.message);
  });
}

async function provision(deviceCertificateId: string, deviceCertificateArn: string) {
  const iotClient: IoTClient = new IoTClient({});
  const { thingName } = await iotClient.send(
    new CreateThingCommand({
      thingName: deviceCertificateId,
      attributePayload: {
        attributes: {
          version: 'v1',
        },
      },
    }),
  );

  const { policyName } = await iotClient.send(
    new CreatePolicyCommand({
      policyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'iot:Connect',
              'iot:Publish',
            ],
            Resource: '*',
          },
        ],
      }),
      policyName: `Policy-${deviceCertificateId}`,
    }),
  );

  await iotClient.send(
    new AttachPolicyCommand({
      policyName: policyName,
      target: deviceCertificateArn,
    }),
  );

  await iotClient.send(
    new AttachThingPrincipalCommand({
      principal: deviceCertificateArn,
      thingName: thingName,
    }),
  );

  await iotClient.send(
    new UpdateCertificateCommand({
      certificateId: deviceCertificateId,
      newStatus: 'ACTIVE',
    }),
  );
}