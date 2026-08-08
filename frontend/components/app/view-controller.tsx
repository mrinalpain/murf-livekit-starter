'use client';

import type { AppConfig } from '@/app-config';
import { SwasthyaSathiView } from '@/components/app/swasthya-sathi-view';

interface ViewControllerProps {
  appConfig: AppConfig;
}

export function ViewController({ appConfig }: ViewControllerProps) {
  return <SwasthyaSathiView appConfig={appConfig} />;
}
