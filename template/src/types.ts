export type Shot = {
  /** Clip trong public/, vd "clips/dep/01.mp4" (đã cắt sẵn, 1080x1920) */
  file: string;
  /** Độ dài cảnh (giây) */
  duration: number;
  /** Bắt đầu từ giây thứ mấy trong file (mặc định 0) */
  start?: number;
  /** Âm lượng tiếng gốc 0..1 (mặc định 0.5) */
  volume?: number;
  /** Phụ đề của cảnh (để trống ở cảnh đầu vì đã có tiêu đề) */
  caption?: string;
  /** Giọng đọc của cảnh trong public/, vd "voice/dep/02.mp3" */
  voice?: string;
};

export type ReviewProps = {
  /** 2 dòng tiêu đề ở cảnh đầu, vd ["Combo gội xả bưởi", "Nhà Hyamin"] */
  title: string[];
  /** Các cảnh theo thứ tự. Cảnh đầu là cảnh "bìa" có tiêu đề. */
  shots: Shot[];
  /** Nhạc nền trong public/, vd "music/nhac.mp3". Bỏ trống nếu gắn nhạc trên TikTok */
  music?: {file: string; volume?: number; start?: number} | null;
  /** Thêm 1 tiếng "ting" nhẹ lúc tiêu đề hiện */
  sfx?: boolean;
};
