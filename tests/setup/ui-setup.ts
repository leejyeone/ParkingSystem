import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

process.env.APP_TIME_ZONE = 'Asia/Seoul';

afterEach(() => {
  cleanup();
});
