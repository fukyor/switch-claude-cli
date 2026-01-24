import type { Provider } from '../types/index.js';

/**
 * Provider 工具类
 * 提供 Provider 自定义字段的提取和环境变量设置功能
 */
export class ProviderUtils {
  /** 标准字段列表，这些字段不会被处理为自定义字段 */
  private static readonly STANDARD_FIELDS = [
    'name',
    'baseUrl',
    'key',
    'default',
    'proxy',
    'defaultHaikuModel',
    'defaultSonnetModel',
    'defaultOpusModel',
  ];

  /**
   * 提取 Provider 中的自定义字段
   * 返回键值对，支持字符串和数字类型（数字会被转换为字符串）
   * 忽略 boolean、null、undefined、对象、数组等其他类型
   *
   * @param provider Provider 对象
   * @returns 自定义字段键值对
   */
  static extractCustomFields(provider: Provider): Record<string, string> {
    const customFields: Record<string, string> = {};

    for (const [key, value] of Object.entries(provider)) {
      // 跳过标准字段
      if (this.STANDARD_FIELDS.includes(key)) {
        continue;
      }

      // 支持字符串类型和数字类型
      if (typeof value === 'string' && value.length > 0) {
        customFields[key] = value;
      } else if (typeof value === 'number') {
        customFields[key] = String(value);
      }
    }

    return customFields;
  }

  /**
   * 将自定义字段设置为环境变量
   *
   * @param customFields 自定义字段键值对
   * @returns 已设置的环境变量数量
   */
  static applyCustomFieldsToEnv(customFields: Record<string, string>): number {
    let count = 0;

    for (const [key, value] of Object.entries(customFields)) {
      // 自定义字段名直接用作环境变量名，不做任何转换
      process.env[key] = value;
      count++;
    }

    return count;
  }
}
