const amazonChineseTemplatePatterns: readonly RegExp[] = [
  /为\s*Amazon\s*制作/u,
  /事实依据\s*[：:]/u,
  /画面要求\s*[：:]/u,
  /资料缺口\s*[：:]/u,
  /禁止臆造/u,
  /禁用声明\s*[：:]/u,
  /平台适配\s*[：:]/u,
  /不得出现(?:文案|价格|促销|评论|评分|联系方式|水印|边框|徽章|竞品)/u,
  /MAIN\s*必须(?:是|使用|保持)/u,
];

/** Detects the old Chinese planning-template scaffolding without rejecting Chinese facts. */
export function hasAmazonChinesePromptTemplate(text: string): boolean {
  return amazonChineseTemplatePatterns.some((pattern) => pattern.test(text));
}
