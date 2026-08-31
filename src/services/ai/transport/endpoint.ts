export type TextTransportProtocol = import("../../../domain/settings/types").TextServiceProtocol;
export type ImageTransportProtocol = import("../../../domain/settings/types").ImageServiceProtocol;

export {
  deriveModelsEndpoint,
  inferTextProtocol,
  isResponsesEndpoint,
  resolveEndpoint,
  resolveImageEndpoint,
  resolveTextEndpoint,
  trimBaseUrl,
} from "../../../domain/settings/endpoints";
