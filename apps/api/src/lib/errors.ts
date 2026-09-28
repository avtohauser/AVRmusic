export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code = 'error') {
    super(message);
  }
}
export const notFound = (what = 'Не найдено') => new HttpError(404, what, 'not_found');
export const badRequest = (msg: string) => new HttpError(400, msg, 'bad_request');
export const unauthorized = (msg = 'Требуется вход') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'Недостаточно прав') => new HttpError(403, msg, 'forbidden');
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict');
