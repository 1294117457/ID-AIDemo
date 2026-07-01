"""文件解析 - 支持 bytes 直接解析"""
import io
from typing import Optional


def parse_file_to_text(content: bytes, filename: str) -> str:
    """
    从字节内容解析文件为文本（同步版本，供 router 层调用）
    
    Args:
        content: 文件字节内容
        filename: 文件名（用于判断格式）
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    parsers = {
        "pdf": _parse_pdf,
        "docx": _parse_docx,
        "doc": _parse_doc,
        "xlsx": _parse_xlsx,
        "xls": _parse_xlsx,
        "txt": _parse_txt,
        "md": _parse_txt,
    }

    parser = parsers.get(ext)
    if not parser:
        return f"[不支持的文件格式: {ext}]"

    try:
        return parser(content)
    except Exception as e:
        print(f"[file_parser] parse error ({filename}): {e}")
        return f"[文件解析失败: {str(e)}]"


def _parse_pdf(content: bytes) -> str:
    """解析 PDF"""
    import pdfplumber

    text_parts = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
    return "\n".join(text_parts)


def _parse_docx(content: bytes) -> str:
    """解析 DOCX"""
    from docx import Document

    doc = Document(io.BytesIO(content))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def _parse_doc(content: bytes) -> str:
    """解析 DOC（旧格式，降级提示）"""
    return "[DOC 格式暂不支持，请另存为 DOCX 或 PDF]"


def _parse_xlsx(content: bytes) -> str:
    """解析 Excel"""
    import openpyxl

    text_parts = []
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        text_parts.append(f"=== Sheet: {sheet_name} ===")
        for row in sheet.iter_rows(values_only=True):
            row_text = " | ".join(str(cell) if cell is not None else "" for cell in row)
            if row_text.strip():
                text_parts.append(row_text)
    return "\n".join(text_parts)


def _parse_txt(content: bytes) -> str:
    """解析纯文本 / Markdown"""
    return content.decode("utf-8", errors="ignore")
