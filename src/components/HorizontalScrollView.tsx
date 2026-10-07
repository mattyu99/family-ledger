import React, { forwardRef, useEffect, useRef } from 'react';
import {
  ScrollView,
  ScrollViewProps,
  Platform,
  StyleSheet,
} from 'react-native';

export interface HorizontalScrollViewProps extends ScrollViewProps {}

/**
 * 跨平台橫向滾動組件
 * - Mobile Native (iOS / Android): 保持 100% 原生流暢 ScrollView
 * - Web (Desktop & Mobile):
 *   1. 支援一般滑鼠滾輪水平轉向（直向滾輪自動轉為橫向滑動）
 *   2. 支援滑鼠按住拖曳（Mouse Drag-to-Scroll，拖曳時自動防範誤觸子項目按鈕）
 *   3. 支援觸控板原生水平慣性滑動
 *   4. 支援行動網頁 touch-action 水平軸向流暢滑動
 */
export const HorizontalScrollView = forwardRef<ScrollView, HorizontalScrollViewProps>(
  ({ children, style, contentContainerStyle, nestedScrollEnabled = true, ...restProps }, forwardedRef) => {
    const innerRef = useRef<ScrollView | null>(null);

    const setRef = (node: ScrollView | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<ScrollView | null>).current = node;
      }
    };

    useEffect(() => {
      if (Platform.OS !== 'web') return;

      const getDomNode = (): HTMLElement | null => {
        if (!innerRef.current) return null;
        const current = innerRef.current as any;
        if (typeof current.getScrollableNode === 'function') {
          return current.getScrollableNode();
        }
        if (current instanceof HTMLElement) {
          return current;
        }
        return null;
      };

      let cleanupListeners: (() => void) | undefined;

      const attach = () => {
        const node = getDomNode();
        if (!node) return false;

        // 設定初始 Web 樣式
        node.style.cursor = 'grab';
        (node.style as any).touchAction = 'pan-x pan-y';
        (node.style as any).webkitOverflowScrolling = 'touch';

        // 1. 滑鼠滾輪事件：將垂直滾輪 deltaY 轉換為水平滾動 scrollLeft
        const handleWheel = (e: WheelEvent) => {
          const maxScrollLeft = node.scrollWidth - node.clientWidth;
          if (maxScrollLeft <= 0) return;

          // 若為觸控板水平雙指手勢 (|deltaX| > |deltaY|)，讓瀏覽器原生平滑慣性滾動處理
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            return;
          }

          let delta = e.deltaY;
          if (delta === 0) return;

          if (e.deltaMode === 1) {
            delta *= 33; // DOM_DELTA_LINE
          } else if (e.deltaMode === 2) {
            delta *= node.clientWidth; // DOM_DELTA_PAGE
          }

          const canScrollLeft = node.scrollLeft > 0 && delta < 0;
          const canScrollRight = node.scrollLeft < maxScrollLeft - 1 && delta > 0;

          if (canScrollLeft || canScrollRight) {
            e.preventDefault();
            node.scrollLeft += delta;
          }
        };

        // 2. 滑鼠拖曳 (Drag-to-Scroll)
        let isMouseDown = false;
        let startX = 0;
        let scrollStart = 0;
        let hasDragged = false;

        const handleMouseDown = (e: MouseEvent) => {
          // 僅限滑鼠主鍵（左鍵）
          if (e.button !== 0) return;

          // 排除表單文字輸入元素
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
            return;
          }

          // 排除觸控產生的模擬滑鼠事件
          if ((e as any).sourceCapabilities?.firesTouchEvents) {
            return;
          }

          if (node.scrollWidth <= node.clientWidth) return;

          isMouseDown = true;
          hasDragged = false;
          startX = e.pageX;
          scrollStart = node.scrollLeft;

          window.addEventListener('mousemove', handleMouseMove, { passive: false });
          window.addEventListener('mouseup', handleMouseUp);
        };

        const handleMouseMove = (e: MouseEvent) => {
          if (!isMouseDown) return;

          const dx = e.pageX - startX;
          if (Math.abs(dx) > 4) {
            hasDragged = true;
            e.preventDefault();
            node.style.cursor = 'grabbing';
            node.style.userSelect = 'none';
          }

          if (hasDragged) {
            node.scrollLeft = scrollStart - dx;
          }
        };

        const handleMouseUp = () => {
          if (!isMouseDown) return;
          isMouseDown = false;

          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);

          node.style.cursor = 'grab';
          node.style.userSelect = '';

          if (hasDragged) {
            // 在 capture 階段攔截隨後的 click 事件，防止拖曳放開時誤點選卡片或按鈕
            const preventClick = (e: MouseEvent) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              e.preventDefault();
              window.removeEventListener('click', preventClick, true);
            };
            window.addEventListener('click', preventClick, true);
            setTimeout(() => {
              window.removeEventListener('click', preventClick, true);
            }, 150);
          }
        };

        node.addEventListener('wheel', handleWheel, { passive: false });
        node.addEventListener('mousedown', handleMouseDown);

        cleanupListeners = () => {
          node.removeEventListener('wheel', handleWheel);
          node.removeEventListener('mousedown', handleMouseDown);
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        };

        return true;
      };

      if (!attach()) {
        const timer = setTimeout(attach, 80);
        return () => {
          clearTimeout(timer);
          if (cleanupListeners) cleanupListeners();
        };
      }

      return () => {
        if (cleanupListeners) cleanupListeners();
      };
    }, []);

    return (
      <ScrollView
        ref={setRef}
        horizontal
        nestedScrollEnabled={nestedScrollEnabled}
        style={[webStyles.scrollView, style]}
        contentContainerStyle={contentContainerStyle}
        {...restProps}
      >
        {children}
      </ScrollView>
    );
  }
);

HorizontalScrollView.displayName = 'HorizontalScrollView';

const webStyles = StyleSheet.create({
  scrollView: Platform.select({
    web: {
      touchAction: 'pan-x pan-y',
      // @ts-ignore
      WebkitOverflowScrolling: 'touch',
    } as any,
    default: {},
  }),
});

