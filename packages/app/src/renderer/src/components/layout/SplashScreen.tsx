import { motion } from 'motion/react';

/**
 * 冷启动开场：墨块显影 → 衬线 M 擦出 → 赭红点落下 → 字标收紧 → 细线扫过。
 * 只在渲染进程首次加载时播放一次；从托盘唤醒不会重播。
 */
export function SplashScreen() {
  return (
    <motion.div
      data-splash="true"
      className="paper-grain fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--bg)]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      aria-hidden="true"
    >
      <motion.div
        className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[19px]"
        style={{ backgroundColor: '#232019' }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.span
          className="text-[42px] leading-none"
          style={{ fontFamily: 'var(--font-serif)', color: '#F7F2E7', fontWeight: 700, letterSpacing: '-1px' }}
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ delay: 0.18, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          M
        </motion.span>
        <motion.span
          className="absolute h-[9px] w-[9px] rounded-full"
          style={{ backgroundColor: '#B44724', top: 14, right: 14 }}
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.18, 1] }}
          transition={{ delay: 0.38, duration: 0.3, times: [0, 0.6, 1], ease: 'easeOut' }}
        />
      </motion.div>

      <motion.p
        className="mt-5 text-[11px] uppercase"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--muted)' }}
        initial={{ opacity: 0, letterSpacing: '0.34em' }}
        animate={{ opacity: 1, letterSpacing: '0.16em' }}
        transition={{ delay: 0.62, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        Memex
      </motion.p>

      <div className="mt-4 h-px w-[104px] overflow-hidden bg-[var(--line)]">
        <motion.div
          className="h-full w-[36%]"
          style={{ backgroundColor: '#B44724' }}
          initial={{ x: '-100%' }}
          animate={{ x: '278%' }}
          transition={{ delay: 0.55, duration: 1.05, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  );
}
