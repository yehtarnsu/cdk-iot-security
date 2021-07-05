import * as path from 'path';
import {
  IoTClient,
  GetRegistrationCodeCommand,
  RegisterCACertificateCommand,
} from '@aws-sdk/client-iot';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  Dealer,
} from '../dealer';
import { CertificateGenerator } from './certificate-generator';
import {
  InformationNotFoundError,
} from './errors';
import {
  RegistrationSchema,
} from './schemas';

export module CaRegistrationDealer {
  export interface Props {
    csrSubjects: CertificateGenerator.CsrSubjects;
    verifierName: string;
    bucketInfo: BucketProps;
  }
  export interface WorkTable {
    certificates: CertificateGenerator.CaRegistrationRequiredCertificates | undefined;
    certificateId: string | undefined;
    certificateArn: string | undefined;
  }
  export interface BucketProps {
    name: string;
    prefix: string;
  }
  export interface Cargo {
    certificateId: string;
  }
}

export class CaRegistrationDealer implements CaRegistrationDealer.WorkTable, Dealer<CaRegistrationDealer.Cargo> {
  public certificates: CertificateGenerator.CaRegistrationRequiredCertificates | undefined;
  public certificateId: string | undefined;
  public certificateArn: string | undefined;

  private verifierName: string | undefined;
  private csrSubjects: CertificateGenerator.CsrSubjects | undefined;
  private bucketInfo: CaRegistrationDealer.BucketProps;

  constructor(props: CaRegistrationDealer.Props) {
    this.verifierName = props.verifierName;
    this.csrSubjects = props.csrSubjects;
    this.bucketInfo = props.bucketInfo;
  }
  async buildCsrSubjects() {
    const { registrationCode } = await new IoTClient({}).send(
      new GetRegistrationCodeCommand({}),
    );
    Object.assign(this.csrSubjects, { commonName: registrationCode });
  }
  async registerCa() {
    this.certificates = CertificateGenerator.getCaRegistrationCertificates(this.csrSubjects);
    const CaRegistration = await new IoTClient({}).send(
      new RegisterCACertificateCommand({
        caCertificate: this.certificates!.ca.certificate,
        verificationCertificate: this.certificates!.verification.certificate,
        allowAutoRegistration: true,
        registrationConfig: {},
        setAsActive: true,
        tags: this.verifierName? [{ Key: 'verifierName', Value: this.verifierName }] : [],
      }),
    );
    const { certificateId, certificateArn } = await RegistrationSchema.validateAsync(CaRegistration)
      .catch((error: Error) => {
        throw new InformationNotFoundError(error.message);
      });
    Object.assign(this, { certificateId, certificateArn });
  }
  async saveCertificates() {
    await new S3Client({}).send(
      new PutObjectCommand({
        Bucket: this.bucketInfo.name,
        Key: path.join(this.bucketInfo.prefix, this.certificateId!, 'ca-certificate.json'),
        Body: Buffer.from(
          JSON.stringify(
            Object.assign(
              {},
              this.certificates,
              {
                certificateId: this.certificateId,
                certificateArn: this.certificateArn,
              },
            ),
          ),
        ),
      }),
    );
  }
  async deal() {
    await this.buildCsrSubjects();
    await this.registerCa();
    await this.saveCertificates();
    return {
      certificateId: this.certificateId!,
    };
  }
}