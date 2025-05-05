// Facade for GLPK types to abstract the glpk.js library interaction

// Basic GLPK type definition based on usage
export interface GLPKVar {
    name: string;
    coef: number;
}

export interface GLPKBound {
    type: number; // e.g., glpk.GLP_FX, glpk.GLP_UP
    ub: number;
    lb: number;
}

export interface GLPKConstraint {
    name: string;
    vars: GLPKVar[];
    bnds: GLPKBound;
}

export interface GLPKObjective {
    direction: number; // e.g., glpk.GLP_MAX
    name: string;
    vars: GLPKVar[];
}

export interface GLPKProblem {
    name: string;
    objective: GLPKObjective;
    subjectTo: GLPKConstraint[];
    binaries?: string[]; // Optional based on usage
}

export interface GLPKSolveResult {
    result: {
        status: number;
        vars: Record<string, number>; // Variable names map to values
        // ... other potential fields like z (objective value)
    };
}

// Define a type for GLPK solver options based on usage
export interface GLPKSolverOptions {
    msglev?: number; // Message level
    presol?: boolean; // Use presolver
    // Add other known options if applicable
}

// Represents the GLPK instance obtained from the library
export interface GLPKInstance {
    GLP_MAX: number;
    GLP_FX: number;
    GLP_UP: number;
    GLP_MSG_OFF: number;
    GLP_UNDEF: number;
    GLP_FEAS: number;
    GLP_INFEAS: number;
    GLP_NOFEAS: number;
    GLP_OPT: number;
    GLP_UNBND: number;
    solve(problem: GLPKProblem, options?: GLPKSolverOptions): Promise<GLPKSolveResult>; // Use specific options type
} 