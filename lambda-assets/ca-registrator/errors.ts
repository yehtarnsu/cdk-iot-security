import { ResourceNotFoundError } from '../errors';
export { InputError } from '../errors';
export class InformationNotFoundError extends ResourceNotFoundError {};
export class VerifierNotFoundError extends ResourceNotFoundError {};