export class InputError extends Error {
  static code: number = 422;
  get code(): number {
    return Object.getPrototypeOf(this).constructor.code;
  }
}

export class ResourceNotFoundError extends Error {
  static code: number = 404;
  get code(): number {
    return Object.getPrototypeOf(this).constructor.code;
  }
}

export class ProcessingError extends Error {
  static code: number = 500;
  get code(): number {
    return Object.getPrototypeOf(this).constructor.code;
  }
}