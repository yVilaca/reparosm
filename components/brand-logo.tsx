import Image from 'next/image';

type BrandLogoProps = {
  className: string;
  priority?: boolean;
  sizes: string;
};

export default function BrandLogo({ className, priority = false, sizes }: BrandLogoProps) {
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
