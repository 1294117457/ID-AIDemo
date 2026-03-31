import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { parseFile } from '../services/docParser.js';
import { analyzeCertificate, generateApplicationRemark } from '../services/analyzeChain.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// 证明材料只接受 PDF，使用随机临时文件名（用完即删）
const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(Buffer.from(file.originalname, 'latin1').toString('utf8')).toLowerCase();
        if (ext === '.pdf')
            cb(null, true);
        else
            cb(new Error('证明材料只支持 PDF 格式'));
    }
});
const router = Router();
/**
 * POST /analyze/certificate
 *
 * 分析证明材料 PDF，对照加分模板列表，返回可申请的加分项推荐。
 *
 * Body (multipart/form-data):
 *   file      : PDF 文件
 *   templates : JSON 字符串，ScoreTemplate[] 列表（由 idbackend 传入，可选）
 */
router.post('/certificate', upload.single('file'), async (req, res) => {
    if (!req.file) {
        res.json({ code: 400, msg: '未收到文件', data: null });
        return;
    }
    const filePath = req.file.path;
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const hintExt = path.extname(originalName).toLowerCase() || '.pdf';
    process.stdout.write(`[CERT_ROUTE] file=${filePath} ext=${hintExt} originalName=${originalName}\n`);
    try {
        // 1. 解析 PDF 文本（传入原始扩展名，multer 临时文件无扩展名）
        process.stdout.write(`[analyze] parsing file: ${filePath}, hintExt: ${hintExt}\n`);
        const certificateText = await parseFile(filePath, hintExt);
        process.stdout.write(`[analyze] certificateText length: ${certificateText.length}\n`);
        if (!certificateText.trim()) {
            res.json({ code: 400, msg: 'PDF 内容为空或无法解析_v2', data: null });
            return;
        }
        // 2. 解析模板列表（由 idbackend 传入）
        let templates = [];
        const templatesRaw = req.body['templates'];
        if (templatesRaw) {
            try {
                const parsed = JSON.parse(templatesRaw);
                templates = Array.isArray(parsed) ? parsed : [];
            }
            catch {
                console.warn('[analyze/certificate] templates 字段解析失败，将以空模板列表继续分析');
            }
        }
        // 3. AI 分析
        const suggestions = await analyzeCertificate(certificateText, templates);
        res.json({
            code: 200,
            msg: '成功',
            data: {
                certificateText: certificateText.slice(0, 3000), // 截断，用于后续 generate 步骤
                suggestions
            }
        });
    }
    catch (err) {
        console.error('[analyze/certificate]', err);
        res.json({ code: 500, msg: `分析失败: ${String(err)}`, data: null });
    }
    finally {
        fs.unlink(filePath, () => { });
    }
});
/**
 * POST /analyze/generate
 *
 * 根据学生选定的模板和规则，生成申请表单预填数据（remark + 分数字段）。
 *
 * Body (application/json):
 *   certificateText    : 上一步 certificate 返回的原文
 *   selectedTemplateId : 学生选择的 templateId
 *   selectedRuleId     : 学生选择的 ruleId
 *   template           : 完整的 ScoreTemplate 对象（由 idbackend 传入）
 */
router.post('/generate', async (req, res) => {
    const { certificateText, selectedTemplateId, selectedRuleId, template } = req.body;
    if (!certificateText || selectedTemplateId == null || selectedRuleId == null || !template) {
        res.json({
            code: 400,
            msg: '缺少必填字段: certificateText / selectedTemplateId / selectedRuleId / template',
            data: null
        });
        return;
    }
    const selectedRule = template.rules.find(r => r.id === selectedRuleId);
    if (!selectedRule) {
        res.json({ code: 400, msg: `模板中未找到 ruleId=${selectedRuleId}`, data: null });
        return;
    }
    try {
        const remark = await generateApplicationRemark(certificateText, template.templateName, selectedRule.ruleName, selectedRule.ruleScore);
        res.json({
            code: 200,
            msg: '成功',
            data: {
                // 与 idbackend ScoreApplicationIDTO 字段对齐，供前端直接填入申请表单
                templateName: template.templateName,
                templateType: template.templateType,
                scoreType: template.scoreType,
                applyScore: selectedRule.ruleScore,
                ruleId: selectedRuleId,
                remark
            }
        });
    }
    catch (err) {
        console.error('[analyze/generate]', err);
        res.json({ code: 500, msg: `生成失败: ${String(err)}`, data: null });
    }
});
export default router;
//# sourceMappingURL=analyze.js.map