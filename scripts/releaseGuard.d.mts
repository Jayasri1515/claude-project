export function assertReleaseBuildAllowed(input: {
  command: string;
  mode: string;
  env: Record<string, string | undefined>;
}): void;
