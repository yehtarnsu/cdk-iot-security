import * as Joi from 'joi';

const CsrSubjectsSchema: Joi.ObjectSchema = Joi.object({
  commonName: Joi.string().allow('').default(''),
  countryName: Joi.string().allow('').default(''),
  stateName: Joi.string().allow('').default(''),
  localityName: Joi.string().allow('').default(''),
  organizationName: Joi.string().allow('').default(''),
  organizationUnitName: Joi.string().allow('').default(''),
}).unknown(true);

export const EventSchema: Joi.ObjectSchema = Joi.object({
  verifierName: Joi.string().allow('', null).default(''),
  csrSubjects: CsrSubjectsSchema,
}).unknown(true);

export const RegistrationSchema = Joi.object({
  certificateId: Joi.string().required(),
  certificateArn: Joi.string().required(),
}).unknown(true);