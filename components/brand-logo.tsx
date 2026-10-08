import Image from 'next/image';

type BrandLogoProps = {
  className: string;
  priority?: boolean;
  sizes: string;
  /** Sobre a tinta da marca (menu, login): sempre a versão clara do logo. */
  onDark?: boolean;
};

export default function BrandLogo({
  className,
  priority = false,
  sizes,
  onDark = false,
}: BrandLogoProps) {
  if (onDark)
    return (
      <Image
        src="/brand/reparosm-logo-dark.png"
        alt="ReparoSM"
        width={756}
        height={153}
        sizes={sizes}
        className={`block h-auto max-w-full ${className}`}
        priority={priority}
      />
    );
  return (
    <>
      <Image
        src="/brand/reparosm-logo.png"
        alt="ReparoSM"
        width={756}
        height={153}
        sizes={sizes}
        className={`block h-auto max-w-full dark:hidden print:block! ${className}`}
        priority={priority}
      />
      <Image
        src="/brand/reparosm-logo-dark.png"
        alt="ReparoSM"
        width={756}
        height={153}
        sizes={sizes}
        className={`hidden h-auto max-w-full dark:block print:hidden! ${className}`}
      />
    </>
  );
}
