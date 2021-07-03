import {
  Request,
  Response,
} from '@softchef/lambda-events';
import { CertificateGenerator } from './certificate-generator';
import { CaRegistrationDealer } from './dealer';
import {
  InputError,
  VerifierNotFoundError,
} from './errors';
import {
  EventSchema,
} from './schemas';

interface Event {
  verifierName: string;
  csrSubjects: CertificateGenerator.CsrSubjects;
}

export const handler = async (event: any = {}) : Promise <any> => {
  const request: Request = new Request(event);
  const response: Response = new Response();
  const verifiers = [...JSON.parse(process.env.VERIFIERS!)];
  try {
    const validEvent: Event = await EventSchema.validateAsync({
      verifierName: request.input('verifierName'),
      csrSubjects: request.input('csrSubjects') ?? {},
    }).catch((error: Error) => {
      throw new InputError(error.message);
    });
    if (validEvent.verifierName && !(validEvent.verifierName = verifiers.find(x => x === validEvent.verifierName) ?? '')) {
      throw new VerifierNotFoundError();
    }
    const caRegistrationDealer = new CaRegistrationDealer({
      verifierName: validEvent.verifierName,
      csrSubjects: validEvent.csrSubjects,
      bucketInfo: {
        name: process.env.BUCKET_NAME!,
        prefix: process.env.BUCKET_PREFIX || '',
      },
    });
    return response.json(
      await caRegistrationDealer.deal(),
    );
  } catch (error) {
    return response.error(error, error.code);
  }
};