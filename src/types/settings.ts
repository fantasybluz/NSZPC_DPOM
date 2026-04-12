export interface Setting {
  key: string;
  value: string;
}

export type SettingKey =
  | 'youtube_api_key'
  | 'youtube_channel_id'
  | 'shop_address'
  | 'shop_phone'
  | 'shop_line';
