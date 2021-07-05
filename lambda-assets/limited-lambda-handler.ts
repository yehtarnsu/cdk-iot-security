import { Request, Response } from '@softchef/lambda-events';
import * as Joi from 'joi';

export type Interface = {[key: string]: any};

export class LimitedLambdaHandler<T extends Interface> {
  constructor(workFlow: (event: T) => Promise<any>, schema?: Joi.ObjectSchema) {
    void this._handler();
    this._handler = async (event) => {
      const castedEvent: T = cast(event, schema);
      return workFlow(castedEvent);
    };
  }
  private async _handler(..._args: any[]): Promise<any> {}
  get handler(): (event?: any) => Promise<any> {
    return this._handler;
  }
  get httpResponseHandler() {
    return async (event?: any) => {
      try {
        const request: Request = new Request(event);
        const result = await this._handler(request.body);
        return new Response().json(result);
      } catch (error) {
        return new Response().error(error.stack, error.code);
      }
    };
  }
}

export function cast<T extends Interface>(event: any = {}, schema?: Joi.ObjectSchema): T {
  if (schema) {
    const { value, error } = schema.validate(event);
    if (error) throw new CastingError(error.message);
    event = value;
  }
  const castedEvent = event as T;
  return castedEvent;
}

export class CastingError extends Error {
  static code: number = 422;
  get code(): number { return Object.getPrototypeOf(this).constructor.code; }
}