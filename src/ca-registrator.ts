import * as path from 'path';
import {
  PolicyStatement,
  Effect,
  Policy,
} from '@aws-cdk/aws-iam';
// import * as lambda from '@aws-cdk/aws-lambda';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import {
  Construct,
  Duration,
} from '@aws-cdk/core';
import { ReviewReceptor } from './review-receptor';
import { VaultProps } from './vault';
import { VerifiersFetcher } from './verifiers-fetcher';

export module CaRegistrator {
  export interface Props {
    /**
     * The AWS SQS Queue collecting the MQTT messages sending
     * from the CA-associated Iot Rule, which sends a message
     * every time a client register its certificate.
     */
    readonly reviewReceptor: ReviewReceptor;
    /**
     * The secure AWS S3 Bucket recepting the CA registration
     * information returned from the CA Registration Function.
     */
    readonly vault: VaultProps;
    /**
     * The verifiers to verify the client certificates.
     */
    readonly verifiers?: VerifiersFetcher.Verifier[];
  }
}
export class CaRegistrator extends NodejsFunction {
  /**
   * Initialize the CA Registrator Function.
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: CaRegistrator.Props) {
    super(scope, `CaRegistrator-${id}`, {
      entry: path.resolve(__dirname, '../lambda-assets/ca-registrator/app.ts'),
      timeout: Duration.seconds(10),
      memorySize: 256,
    });
    this.addEnvironment('BUCKET_NAME', props.vault.bucket.bucketName);
    this.addEnvironment('BUCKET_PREFIX', props.vault.prefix ?? '');
    this.addEnvironment('VERIFIERS', JSON.stringify(
      props.verifiers?.map(verifier => verifier.functionName) || '[]',
    ),
    );
    this.role!.attachInlinePolicy(
      new Policy(this, `CaRegistrator-${id}`, {
        statements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
              'iam:PassRole',
              'iot:RegisterCACertificate',
              'iot:GetRegistrationCode',
              'iot:CreateTopicRule',
            ],
            resources: ['*'],
          }),
        ],
      }),
    );
  }
}