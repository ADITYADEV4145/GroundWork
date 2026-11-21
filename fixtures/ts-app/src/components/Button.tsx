import React from 'react';
import { slugify } from '../utils';

export interface ButtonProps {
  label: string;
  onClick?: () => void;
}

/** Primary button. */
export function Button({ label, onClick }: ButtonProps) {
  return <button id={slugify(label)} onClick={onClick}>{label}</button>;
}

export const IconButton = ({ icon }: { icon: string }) => <span className="icon">{icon}</span>;

export default function Toolbar() {
  return (
    <div>
      <Button label="Save" />
    </div>
  );
}
