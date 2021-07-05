import * as Joi from 'joi';

export const DeviceCertificateDescriptionSchema = Joi.object({
  caCertificateId: Joi.string().required(),
  certificateArn: Joi.string().regex(/^arn/).required(),
}).unknown(true);

export const TagListSchema = Joi.array().items(
  Joi.object({
    Key: Joi.string().required(),
    Value: Joi.string(),
  }).optional(),
).required();

export const CaCertificateDescriptionSchema = Joi.object({
  certificateArn: Joi.string().regex(/^arn/).required(),
}).unknown(true);

export const VerificationSchema = Joi.object({
  verified: Joi.boolean().allow(true).only().required(),
}).required().unknown(true);