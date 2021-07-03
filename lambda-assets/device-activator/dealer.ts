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
import {
  Dealer,
} from '../dealer';
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

export module DeviceActivationDealer {
  export interface Props {
    deviceCertificateId: string;
  }
  export interface WorkTable {
    deviceCertificateId: string | undefined;
    deviceCertificateArn: string | undefined;
    caCertificateId: string | undefined;
    deviceCertificateDescription: any;
    verifierName: string | undefined;
  }
  export interface Cargo {
    certificateId: string;
    verifierName: string;
  }
}

export class DeviceActivationDealer implements DeviceActivationDealer.WorkTable, Dealer<DeviceActivationDealer.Cargo> {
  public deviceCertificateId: string | undefined;
  public deviceCertificateArn: string | undefined;
  public caCertificateId: string | undefined;
  public deviceCertificateDescription: any;
  public verifierName: string | undefined;

  constructor(props: DeviceActivationDealer.Props) {
    this.deviceCertificateId = props.deviceCertificateId;
  }
  async getDeviceCertificateInformation() {
    const { certificateDescription: deviceCertificateDescription = {} } = await new IoTClient({}).send(
      new DescribeCertificateCommand({
        certificateId: this.deviceCertificateId,
      }),
    );
    const { caCertificateId, certificateArn: deviceCertificateArn } = await DeviceCertificateDescriptionSchema
      .validateAsync(deviceCertificateDescription).catch((error: Error) => {
        throw new InformationNotFoundError(error.message);
      });
    Object.assign(this, {
      caCertificateId,
      deviceCertificateArn,
      deviceCertificateDescription,
    });
  }
  async getVerifierName() {
    const { certificateDescription: caCertificateDescription = {} } = await new IoTClient({}).send(
      new DescribeCACertificateCommand({ certificateId: this.caCertificateId! }),
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
    Object.assign(this, { verifierName });
  }

  async verify() {
    if (this.verifierName) {
      let {
        Payload: payload = new Uint8Array(
          Buffer.from(JSON.stringify({ verified: false })),
        ),
      } = await new LambdaClient({}).send(
        new InvokeCommand({
          FunctionName: decodeURIComponent(this.verifierName),
          Payload: Buffer.from(
            JSON.stringify(this.deviceCertificateDescription),
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
  }
  async provision() {
    const iotClient: IoTClient = new IoTClient({});
    const { thingName } = await iotClient.send(
      new CreateThingCommand({
        thingName: this.deviceCertificateId,
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
        policyName: `Policy-${this.deviceCertificateId}`,
      }),
    );

    await iotClient.send(
      new AttachPolicyCommand({
        policyName: policyName,
        target: this.deviceCertificateArn,
      }),
    );

    await iotClient.send(
      new AttachThingPrincipalCommand({
        principal: this.deviceCertificateArn,
        thingName: thingName,
      }),
    );

    await iotClient.send(
      new UpdateCertificateCommand({
        certificateId: this.deviceCertificateId,
        newStatus: 'ACTIVE',
      }),
    );
  }
  async deal() {
    await this.getDeviceCertificateInformation();
    await this.getVerifierName();
    await this.verify();
    await this.provision();
    return {
      certificateId: this.deviceCertificateId!,
      verifierName: this.verifierName!,
    };
  }
}