export type Merge<Parent, Child> = Child & Omit<Parent, keyof Child>;
