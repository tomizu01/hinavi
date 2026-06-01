// TTS 読み間違い対策の強制置換辞書。
// ここに追加すると、TTS API に送信する直前に適用される（画面表示は影響を受けない）。
// 順序が重要: 長い/具体的な語を先に書く。例: "何を" は "何" より先（現状 "何" 単独は登録なし）。

export const TTS_READING_OVERRIDES: ReadonlyArray<readonly [string, string]> = [
  ['辛い', 'からい'],
  ['お腹', 'おなか'],
  ['何を', 'なにを'],
  ['何に', 'なにに'],
  ['何が', 'なにが'],
  ['街中', 'まちなか'],
];

export function applyTtsReadings(text: string): string {
  let out = text;
  for (const [from, to] of TTS_READING_OVERRIDES) {
    out = out.split(from).join(to);
  }
  return out;
}
