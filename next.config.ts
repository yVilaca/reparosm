import type { NextConfig } from 'next';

// Receber e pagar ficam numa tela só; os endereços antigos levam para ela,
// mantendo os parâmetros (por exemplo, ?pagar=<id>).
const receivePay = '/receber-e-pagar';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/contas-receber', destination: `${receivePay}?ver=receber`, permanent: false },
      { source: '/contas-pagar', destination: `${receivePay}?ver=pagar`, permanent: false },
      { source: '/compras', destination: `${receivePay}?ver=pagar`, permanent: false },
    ];
  },
};

export default nextConfig;
