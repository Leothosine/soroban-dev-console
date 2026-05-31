type Props = {
  value: string;
};

export function RedactedContent({
  value,
}: Props) {
  return (
    <span>
      {value}
    </span>
  );
}