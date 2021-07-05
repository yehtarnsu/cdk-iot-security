import { Response } from '@softchef/lambda-events';
import { DeviceActivationDealer } from './dealer';

export const handler = async (event: any = {}) : Promise <any> => {
  let response: Response = new Response();
  let [record] = event.Records;
  const { certificateId: deviceCertificateId } = JSON.parse(record.body);
  const deviceActivationDealer = new DeviceActivationDealer({ deviceCertificateId });
  return response.json(await deviceActivationDealer.deal());
};