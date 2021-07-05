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
import { LimitedLambdaHandler } from '../limited-lambda-handler';
import { CertificateGenerator } from './certificate-generator';
// import { CaRegistrationDealer } from './dealer';
import {
  VerifierNotFoundError,
  InformationNotFoundError,
} from './errors';
import {
  EventSchema,
  RegistrationSchema,
} from './schemas';

interface Event {
  verifierName: string;
  csrSubjects: CertificateGenerator.CsrSubjects;
}

interface BucketProps {
  name: string;
  prefix: string;
}

/**
 * The lambda function handler for register CA.
 * @param event The HTTP request from the API gateway.
 * @returns The HTTP response containing the registration result.
 */
export const handler = new LimitedLambdaHandler<Event>(async (event: Event) => {
  const bucketInfo: BucketProps = {
    name: process.env.BUCKET_NAME!,
    prefix: process.env.BUCKET_PREFIX || '',
  };
  const verifierName = extractVerifierName(event.verifierName);
  const csrSubjects = await buildCsrSubjects(event.csrSubjects);
  const certificates = CertificateGenerator.getCaRegistrationCertificates(csrSubjects);
  const { certificateId, certificateArn } = await registerCa(certificates, verifierName);
  await saveCertificates(bucketInfo, certificateId, certificateArn, certificates);
  return { certificateId: certificateId };
}, EventSchema).httpResponseHandler;

function extractVerifierName(verifierName: string): string {
  if (verifierName && !(verifierName = [...JSON.parse(process.env.VERIFIERS!)].find(x => x === verifierName) ?? '')) {
    throw new VerifierNotFoundError();
  }
  return verifierName;
}

async function buildCsrSubjects (csrSubjects: CertificateGenerator.CsrSubjects): Promise<CertificateGenerator.CsrSubjects> {
  const { registrationCode } = await new IoTClient({}).send(
    new GetRegistrationCodeCommand({}),
  );
  csrSubjects = Object.assign(csrSubjects, { commonName: registrationCode });
  return csrSubjects;
}

async function registerCa (certificates: CertificateGenerator.CaRegistrationRequiredCertificates, verifierName: string) {
  const CaRegistration = await new IoTClient({}).send(
    new RegisterCACertificateCommand({
      caCertificate: certificates.ca.certificate,
      verificationCertificate: certificates.verification.certificate,
      allowAutoRegistration: true,
      registrationConfig: {},
      setAsActive: true,
      tags: verifierName? [{ Key: 'verifierName', Value: verifierName }] : [],
    }),
  );
  const { certificateId, certificateArn } = await RegistrationSchema.validateAsync(CaRegistration)
    .catch((error: Error) => {
      throw new InformationNotFoundError(error.message);
    });
  return { certificateId, certificateArn };
}

async function saveCertificates(bucketInfo: BucketProps, certificateId: string, certificateArn: string,
  certificates: CertificateGenerator.CaRegistrationRequiredCertificates) {
  await new S3Client({}).send(
    new PutObjectCommand({
      Bucket: bucketInfo.name,
      Key: path.join(bucketInfo.prefix, certificateId, 'ca-certificate.json'),
      Body: Buffer.from(
        JSON.stringify(
          Object.assign(
            {},
            certificates,
            {
              certificateId: certificateId,
              certificateArn: certificateArn,
            },
          ),
        ),
      ),
    }),
  );
}
