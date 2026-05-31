@Injectable()
export class RedactionService {
  redact(value: string): string {
    let result = value;

    for (const pattern of REDACTION_PATTERNS) {
      result = result.replace(
        pattern.regex,
        pattern.replacement,
      );
    }

    return result;
  }
}