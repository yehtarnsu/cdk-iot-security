import {
  ResourceNotFoundError,
  ProcessingError,
} from '../errors';
export { InputError } from '../errors';
export class VerificationError extends ProcessingError {};
export class InformationNotFoundError extends ResourceNotFoundError {};