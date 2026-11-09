import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {ReviewProps} from './types';
import {captionFont, titleFont} from './fonts';
import {Flower, Heart, Sparkle} from './Stickers';

/**
 * Gõ từng ký tự như mẫu CapCut: ký tự mới hiện nhỏ, thấp, mờ rồi nảy lên đúng chỗ (~4 khung).
 * Trả về các từ (giữ nguyên từ không bị ngắt dòng giữa chừng). Ký tự chưa tới lượt thì không render
 * để khung nền dài ra theo chữ.
 */
const PopText: React.FC<{
  text: string;
  charsPerSec: number;
  startIndex?: number;
  /** Giữ chỗ cho chữ chưa hiện (ẩn) để dòng không nhảy khi đang gõ */
  reserve?: boolean;
}> = ({text, charsPerSec, startIndex = 0, reserve = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const chars = Array.from(text);
  const words: {ch: string; idx: number}[][] = [[]];
  chars.forEach((ch, i) => {
    if (ch === ' ') words.push([]);
    else words[words.length - 1].push({ch, idx: startIndex + i});
  });
  const appearAt = (idx: number) => (idx * fps) / charsPerSec;
  return (
    <>
      {words.map((w, wi) => {
        const visible = reserve ? w : w.filter((c) => frame >= appearAt(c.idx));
        if (visible.length === 0) return null;
        return (
          <React.Fragment key={wi}>
            {wi > 0 && ' '}
            <span style={{whiteSpace: 'nowrap'}}>
              {visible.map((c) => {
                const shownYet = frame >= appearAt(c.idx);
                const p = interpolate(frame - appearAt(c.idx), [0, 4], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
                return (
                  <span
                    key={c.idx}
                    style={{
                      display: 'inline-block',
                      transform: `translateY(${(1 - p) * 0.35}em) scale(${0.45 + 0.55 * p})`,
                      transformOrigin: '50% 100%',
                      opacity: shownYet ? 0.3 + 0.7 * p : 0,
                    }}
                  >
                    {c.ch}
                  </span>
                );
              })}
            </span>
          </React.Fragment>
        );
      })}
    </>
  );
};

const countChars = (s: string) => Array.from(s).length;

const TITLE_SPEED = 15; // ký tự/giây, đo từ mẫu

/** Âm thanh tiêu đề: chỉ 1 tiếng "ting" nhẹ lúc mở đầu (không lạm dụng tiếng tách từng chữ) */
const TitleSfx: React.FC = () => <Audio src={staticFile('sfx/ting.wav')} volume={0.3} />;

/** Mép giấy xé: đa giác răng cưa cố định theo độ dài dòng */
const tornClip = (seed: number) => {
  const pts: string[] = [];
  const n = 14;
  const r = (i: number) => ((Math.sin(seed * 12.9 + i * 78.2) * 43758.5) % 1 + 1) % 1;
  for (let i = 0; i <= n; i++) pts.push(`${(i / n) * 100}% ${r(i) * 9}%`);
  for (let i = n; i >= 0; i--) pts.push(`${(i / n) * 100}% ${100 - r(i + 40) * 9}%`);
  return `polygon(${pts.join(',')})`;
};

/** Tiêu đề kiểu mẫu: chữ hồng trên mảnh giấy kem mép xé, gõ từng chữ */
const Title: React.FC<{lines: string[]}> = ({lines}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const SPEED = TITLE_SPEED;
  const starts = lines.map((_, i) =>
    lines.slice(0, i).reduce((sum, l) => sum + countChars(l) + 1, 0),
  );

  return (
    <AbsoluteFill style={{alignItems: 'center', top: '13%'}}>
      <div style={{position: 'relative', textAlign: 'center'}}>
        {lines.map((line, i) => {
          const started = frame >= (starts[i] * fps) / SPEED;
          return (
            <div key={i} style={{height: 104, display: 'flex', justifyContent: 'center'}}>
              {started && (
                <span
                  style={{
                    fontFamily: titleFont,
                    fontSize: 76,
                    lineHeight: '96px',
                    color: '#e8478c',
                    background: 'rgba(251,242,228,0.93)',
                    padding: '0 26px',
                    clipPath: tornClip(i + 1),
                    whiteSpace: 'pre',
                  }}
                >
                  <PopText text={line} charsPerSec={SPEED} startIndex={starts[i]} />
                </span>
              )}
            </div>
          );
        })}
        <Flower size={52} style={{right: -46, top: -18}} />
        <Heart size={46} style={{left: -42, bottom: 6}} />
      </div>
    </AbsoluteFill>
  );
};

/** Phụ đề kiểu mẫu: chữ có chân vàng nhạt viền nâu, sao hồng nhỏ 2 bên */
const Caption: React.FC<{text: string; speakSeconds: number}> = ({text, speakSeconds}) => {
  const frame = useCurrentFrame();
  // Gõ xong trong khoảng nửa đầu cảnh, tối thiểu 18 ký tự/giây
  const speed = Math.max(18, countChars(text) / Math.max(0.8, speakSeconds * 0.5));
  const opacity = interpolate(frame, [0, 3], [0, 1], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{alignItems: 'center', top: '23%', padding: '0 110px'}}>
      <div style={{position: 'relative', textAlign: 'center', opacity, textWrap: 'balance'}}>
        <span
          style={{
            fontFamily: captionFont,
            fontSize: 46,
            lineHeight: 1.35,
            color: '#fff5b0',
            WebkitTextStroke: '6px #4b3527',
            paintOrder: 'stroke fill',
            textShadow: '0 3px 6px rgba(0,0,0,0.25)',
          }}
        >
          <PopText text={text} charsPerSec={speed} reserve />
        </span>
        <Sparkle size={34} color="#ffb3d1" style={{left: -40, top: -14}} />
        <Sparkle size={40} color="#ff8fbd" style={{right: -46, top: -22}} delay={4} />
      </div>
    </AbsoluteFill>
  );
};

export const Review: React.FC<ReviewProps> = ({title, shots, music, sfx}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);

  return (
    <AbsoluteFill style={{backgroundColor: '#f4f1fa'}}>
      {music && (
        <Audio
          src={staticFile(music.file)}
          startFrom={f(music.start ?? 0)}
          loop
          volume={(fr) =>
            (music.volume ?? 0.25) *
            interpolate(fr, [0, 10, durationInFrames - 20, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      )}

      <Series>
        {shots.map((s, i) => (
          <Series.Sequence key={i} durationInFrames={f(s.duration)}>
            <OffthreadVideo
              src={staticFile(s.file)}
              startFrom={f(s.start ?? 0)}
              volume={s.volume ?? (s.voice ? 0.5 : 0.6)}
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
            />
            {s.voice && (
              <Sequence from={4}>
                <Audio src={staticFile(s.voice)} volume={1} />
              </Sequence>
            )}
            {i === 0 && <Title lines={title} />}
            {i === 0 && sfx && <TitleSfx />}
            {i > 0 && s.caption && (
              <Sequence from={3}>
                <Caption text={s.caption} speakSeconds={s.duration - 0.4} />
              </Sequence>
            )}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
